import { NextRequest, NextResponse } from "next/server";
import { BASELINE, type ResumeContent } from "@/lib/resume-baseline";
import {
  MODELS,
  extractJson,
  nimChat,
  type ModelKey,
} from "@/lib/nim";
import {
  KEYWORD_EXTRACTION_SYSTEM,
  RESUME_RULES_SYSTEM,
  atsScore,
  rewriteUserPrompt,
} from "@/lib/prompts";
import { repairJson } from "@/lib/nim";
import { resolveJdText, slugTitleFromUrl } from "@/lib/jd-source";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { TokenSet, termMatched } from "@/lib/matching";

export const runtime = "nodejs";
export const maxDuration = 240;

type Keyword = { term: string; important: boolean };

type OptimizeResponse = {
  keywords: Keyword[];
  matchedBefore: string[];
  missingBefore: string[];
  scoreBefore: number;
  scoreAfter: number;
  usedWriter: string;
  roleTitle: string;
  matchedAfter: string[];
  missingAfter: string[];
  edits: ResumeContent & {
    skillDiffs: { label: string; before: string; after: string }[];
    bulletDiffs: {
      id: string;
      project: string;
      before: string[];
      after: string[];
    }[];
    summaryBefore: string;
    summaryAfter: string;
  };
};

function resumeAsText(c: ResumeContent): string {
  const skills = c.skills.flatMap((s) => s.items).join(", ");
  const bullets = c.projects
    .flatMap((p) => p.bullets)
    .join("\n");
  return `${c.summary}\n${skills}\n${bullets}`.toLowerCase();
}

function matchKeywords(
  kws: Keyword[],
  text: string
): { matched: string[]; missing: string[] } {
  // Token-set matching with plural tolerance (see lib/matching.ts) — order
  // and punctuation do not matter, so honest paraphrases score correctly.
  const res = new TokenSet(text);
  const matched: string[] = [];
  const missing: string[] = [];
  for (const k of kws) {
    (termMatched(k.term, res) ? matched : missing).push(k.term);
  }
  return { matched, missing };
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`optimize:${clientIp(req)}`, 10);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterS}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } }
    );
  }
  try {
    const { jd, model = "primary" } = (await req.json()) as {
      jd: string;
      model?: ModelKey;
    };
    if (!jd || jd.trim().length < 8) {
      return NextResponse.json(
        { error: "Paste a job description or a link to the posting." },
        { status: 400 }
      );
    }
    // JD may be a URL — resolve to text (with SSRF + size guards)
    let jdText: string;
    try {
      jdText = await resolveJdText(jd);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }
    const writerModel = MODELS[model] ?? MODELS.primary;
    const resumeJson = JSON.stringify(BASELINE, null, 2);
    const baselineText = resumeAsText(BASELINE);
    let lastKwErr: Error | null = null;

    // Step 1 — extract keywords (fast model). Two attempts: JSON mode, then
    // free-form; reasoning models occasionally emit malformed JSON in JSON mode.
    let keywords: Keyword[] = [];
    let roleTitle = "Resume";
    for (const a of [{ jsonMode: true }, { jsonMode: false }]) {
      try {
        const kwRaw = await nimChat({
          model: MODELS.fast,
          system: KEYWORD_EXTRACTION_SYSTEM,
          user: `Job description:\n"""\n${jdText}\n"""\nReturn ONLY the JSON object.`,
          temperature: a.jsonMode ? 0.2 : 0.1,
          maxTokens: 3072,
          jsonMode: a.jsonMode,
          thinkingOff: MODELS.fast.includes("nemotron-3.5-super-vl"),
        });
        const kwData = extractJson(repairJson(kwRaw)) as {
          roleTitle?: string;
          keywords: Keyword[];
        };
        if (Array.isArray(kwData.keywords) && kwData.keywords.length) {
          keywords = kwData.keywords.slice(0, 25);
          roleTitle =
            typeof kwData.roleTitle === "string" && kwData.roleTitle.trim()
              ? kwData.roleTitle.trim().slice(0, 60)
              : slugTitleFromUrl(jd) || "Resume";
          break;
        }
      } catch (e) {
        lastKwErr = e as Error;
        continue;
      }
    }
    if (!keywords.length) {
      return NextResponse.json(
        {
          error: lastKwErr
            ? `Keyword extraction failed: ${lastKwErr.message}`
            : "Could not extract keywords from that job description.",
        },
        { status: 422 }
      );
    }

    // Step 2 — rewrite. Super-VL runs with thinking off (fast, valid JSON);
    // gpt-oss uses "low" reasoning effort. Hard timeout + automatic fallback
    // to the alternate writer so a queued/unavailable primary never bricks
    // the flow.
    let rewriteRaw = "";
    let usedWriter = writerModel;
    const superVl = writerModel.includes("nemotron-3.5-super-vl");
    const effort = writerModel.includes("gpt-oss") ? "low" : undefined;
    // attempt 1: strict JSON mode. attempt 2: free-form (prompt already demands
    // strict JSON; extractJson strips fences / think blocks).
    const attempts = [
      { jsonMode: true, reasoningEffort: effort },
      { jsonMode: false, reasoningEffort: undefined },
    ];
    let lastWriterErr: Error | null = null;
    for (const a of attempts) {
      try {
        const raw = await nimChat({
          model: writerModel,
          system: RESUME_RULES_SYSTEM,
          user: rewriteUserPrompt("", jdText, resumeJson),
          temperature: 0.4,
          maxTokens: 8192,
          jsonMode: a.jsonMode,
          reasoningEffort: a.reasoningEffort,
          thinkingOff: superVl,
          timeoutMs: 110_000,
        });
        if (!raw.trim()) {
          lastWriterErr = new Error("Writer returned empty content");
          continue;
        }
        extractJson(repairJson(raw)); // throws if unparseable
        rewriteRaw = raw;
        break;
      } catch (e) {
        lastWriterErr = e as Error;
      }
    }
    if (!rewriteRaw.trim()) {
      throw lastWriterErr ?? new Error("Writer failed");
    }
    const edits = extractJson(rewriteRaw) as ResumeContent;

    // Validation: never let the model change labels/order/bullet counts/ids
    if (!edits?.summary || !Array.isArray(edits.skills) || !Array.isArray(edits.projects)) {
      return NextResponse.json(
        { error: "Model returned an invalid edit shape. Try again." },
        { status: 502 }
      );
    }
    if (edits.skills.length !== BASELINE.skills.length) {
      return NextResponse.json(
        { error: "Model changed the number of skill categories — rejected." },
        { status: 502 }
      );
    }
    for (let i = 0; i < BASELINE.skills.length; i++) {
      if (edits.skills[i].label !== BASELINE.skills[i].label) {
        return NextResponse.json(
          { error: `Model changed skill label "${BASELINE.skills[i].label}" — rejected.` },
          { status: 502 }
        );
      }
      if (!edits.skills[i].items.length) {
        return NextResponse.json(
          { error: `Model emptied skill category "${BASELINE.skills[i].label}" — rejected.` },
          { status: 502 }
        );
      }
    }
    for (const proj of BASELINE.projects) {
      const out = edits.projects.find((p) => p.id === proj.id);
      if (!out) {
        return NextResponse.json(
          { error: `Model dropped project ${proj.id} — rejected.` },
          { status: 502 }
        );
      }
      if (out.bullets.length !== proj.bullets.length) {
        return NextResponse.json(
          { error: `Model changed bullet count for project ${proj.id} (${proj.bullets.length} expected) — rejected.` },
          { status: 502 }
        );
      }
    }

    // Factual guard: all original metrics/scores must survive in bullets
    const changedProj = edits.projects.find((p, i) => {
      const before = BASELINE.projects[i].bullets.join(" ");
      const after = p.bullets.join(" ");
      const nums = before.match(/\d+(?:\.\d+)?(?:\/\d+)?/g) ?? [];
      return nums.some(
        (n) => !after.includes(n)
      );
    });
    if (changedProj) {
      return NextResponse.json(
        { error: `Model altered the metrics of project ${changedProj.id} — rejected. Try regenerating.` },
        { status: 502 }
      );
    }

    // Length guard: the frozen template is a one-page layout. The writer
    // must not inflate content enough to spill onto a second page.
    // 1) skills: drop items the resume cannot support, cap per line
    let trimmedSkills: string[] = [];
    const supportedText = resumeAsText(BASELINE);
    const tokensOf = (s: string) =>
      s.toLowerCase().split(/[^a-z0-9+#.]+/i).filter((w) => w.length > 1);
    for (let i = 0; i < edits.skills.length; i++) {
      const before = BASELINE.skills[i];
      const line = edits.skills[i];
      const cap = Math.max(before.items.length + 1, 7);
      let items = line.items.slice(0, cap);
      items = items.filter((item) => {
        const toks = tokensOf(item);
        if (!toks.length) return false;
        const hits = toks.filter((w) => supportedText.includes(w)).length;
        return hits / toks.length >= 0.5;
      });
      for (const gone of line.items.filter((x) => !items.includes(x))) {
        trimmedSkills.push(gone);
      }
      if (!items.length) items = before.items; // never empty a line
      edits.skills[i].items = items;
    }
    // 2) bullets: per-bullet length cap vs the source
    const bulletCap = (before: string) => before.length * 1.15 + 30;
    edits.projects.forEach((p, i) => {
      p.bullets = p.bullets.map((b, j) => {
        const before = BASELINE.projects[i].bullets[j];
        if (b.length <= bulletCap(before)) return b;
        // Trim under cap, preferring to drop non-numeric sentences from the tail
        // first (metrics live in numeric sentences and must survive; original
        // sentence order is preserved for everything kept).
        const sentences = b.split(/(?<=\.)\s+/);
        const hasNum = (s: string) => /\d/.test(s);
        let kept = [...sentences];
        const cap = bulletCap(before);
        for (let i = kept.length - 1; i > 0 && kept.join(" ").length > cap; i--) {
          if (!hasNum(kept[i])) {
            kept.splice(i, 1);
          }
        }
        if (kept.join(" ").length > cap) return b; // all-numeric or unfixable
        return kept.join(" ");
      });
    });

    // 3) whole-document budget: total editable text may exceed the source by
    // at most 10% + 120 chars — the frozen LaTeX template is exactly one page.
    const baseTotal =
      BASELINE.summary.length +
      BASELINE.skills.flatMap((s) => s.items).join(", ").length +
      BASELINE.projects.flatMap((p) => p.bullets).join(" ").length;
    const budget = baseTotal * 1.1 + 120;
    const docTotal = () =>
      edits.summary.length +
      edits.skills.flatMap((s) => s.items).join(", ").length +
      edits.projects.flatMap((p) => p.bullets).join(" ").length;
    const trimTail = (before: string, s: string) => {
      const hasNum = (x: string) => /\d/.test(x);
      const sentences = s.split(/(?<=\.)\s+/);
      let kept = [...sentences];
      for (let k = kept.length - 1; k > 0 && kept.join(" ").length > before.length * 1.05; k--) {
        if (!hasNum(kept[k])) kept.splice(k, 1);
      }
      return kept.join(" ") === s ? s : kept.join(" ");
    };
    for (let pass = 0; pass < 3 && docTotal() > budget; pass++) {
      for (let pi = 0; pi < edits.projects.length; pi++) {
        for (let bi = 0; bi < edits.projects[pi].bullets.length; bi++) {
          if (docTotal() <= budget) break;
          const t = trimTail(BASELINE.projects[pi].bullets[bi], edits.projects[pi].bullets[bi]);
          if (t !== edits.projects[pi].bullets[bi]) edits.projects[pi].bullets[bi] = t;
        }
      }
      if (docTotal() > budget) break; // further passes only if first helped
    }

    // Step 3 — score before / after. The score champions the keywords the
    // extraction flagged `important` (fallback: all keywords when too few
    // are flagged); chips keep showing every keyword. Numerator and
    // denominator always refer to the same set.
    const importantSet = keywords.filter((k) => k.important);
    const scoreSet = importantSet.length >= 5 ? importantSet : keywords;
    const before = matchKeywords(keywords, baselineText);
    const afterText = resumeAsText(edits);
    const after = matchKeywords(keywords, afterText);
    const scoreBeforeText = matchKeywords(scoreSet, baselineText);
    const scoreAfterText = matchKeywords(scoreSet, afterText);
    const scoreBefore = atsScore(scoreBeforeText.matched.length, scoreSet.length);
    const scoreAfter = atsScore(scoreAfterText.matched.length, scoreSet.length);

    const skillDiffs = BASELINE.skills.map((s, i) => ({
      label: s.label,
      before: s.items.join(", "),
      after: edits.skills[i].items.join(", "),
    }));
    const bulletDiffs = BASELINE.projects.map((p, i) => ({
      id: p.id,
      project: PROJECT_NAME[p.id] ?? p.id,
      before: p.bullets,
      after: edits.projects[i].bullets,
    }));

    const resp: OptimizeResponse = {
      keywords,
      matchedBefore: before.matched,
      missingBefore: before.missing,
      scoreBefore,
      scoreAfter,
      usedWriter,
      roleTitle,
      matchedAfter: after.matched,
      missingAfter: after.missing,
      edits: {
        ...edits,
        skillDiffs,
        bulletDiffs,
        summaryBefore: BASELINE.summary,
        summaryAfter: edits.summary,
      },
    };
    return NextResponse.json(resp);
  } catch (err: unknown) {
    const e = err as Error;
    const msg = e.message || "Unknown error";
    return NextResponse.json(
      {
        error: msg.includes("NVIDIA_API_KEY")
          ? "NVIDIA_API_KEY is not configured. Add it to .env.local and restart the dev server."
          : msg,
      },
      { status: 500 }
    );
  }
}

const PROJECT_NAME: Record<string, string> = {
  halos: "Halos AI — F1 Chatbot",
  skytrace: "SkyTrace — Satellite Tracker",
  eaurouge: "EauRouge-F1 — Qwen3-8B QLoRA",
};
