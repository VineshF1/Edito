import { NextRequest, NextResponse } from "next/server";
import { BASELINE, type ResumeContent } from "@/lib/resume-baseline";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { compileToPdf } from "@/lib/compile";
import { fillTemplate } from "@/lib/latex";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_SUMMARY = 1500;
const MAX_BULLET = 600;
const MAX_SKILL_LINE = 300;

function fail(content: ResumeContent | undefined): string | null {
  if (!content || typeof content !== "object") return "Missing content.";
  if (typeof content.summary !== "string" || content.summary.length > MAX_SUMMARY)
    return "Invalid summary.";
  if (content.summary.trim().length < 40) return "Summary is too short.";
  if (!Array.isArray(content.skills) || content.skills.length !== BASELINE.skills.length)
    return "Skills structure does not match the template.";
  for (let i = 0; i < BASELINE.skills.length; i++) {
    const s = content.skills[i];
    if (!s || s.label !== BASELINE.skills[i].label) return "Skill labels must match the template.";
    if (!Array.isArray(s.items) || !s.items.length || s.items.length > 14)
      return `Invalid items for "${s.label}".`;
    if (s.items.some((it) => typeof it !== "string" || !it.trim() || it.length > MAX_SKILL_LINE))
      return `Invalid skill item in "${s.label}".`;
  }
  if (!Array.isArray(content.projects) || content.projects.length !== BASELINE.projects.length)
    return "Projects structure does not match the template.";
  for (let i = 0; i < BASELINE.projects.length; i++) {
    const p = content.projects[i];
    const b = BASELINE.projects[i];
    if (!p || p.id !== b.id) return "Project ids must match the template.";
    if (!Array.isArray(p.bullets) || p.bullets.length !== b.bullets.length)
      return `Bullet count mismatch for ${p.id}.`;
    if (p.bullets.some((x) => typeof x !== "string" || !x.trim() || x.length > MAX_BULLET))
      return `Invalid bullet in project ${p.id}.`;
  }
  return null;
}

// POST { content?: ResumeContent, roleTitle?: string } â€” omit for baseline resume
export async function POST(req: NextRequest) {
  const rl = rateLimit(`compile:${clientIp(req)}`, 20);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterS}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } }
    );
  }
  try {
    let content: ResumeContent | undefined;
    let roleTitle = "";
    try {
      const body = (await req.json()) as {
        content?: ResumeContent;
        roleTitle?: string;
      };
      content = body.content;
      roleTitle =
        typeof body.roleTitle === "string" ? body.roleTitle.trim() : "";
    } catch {
      // empty body = baseline compile
    }
    const violation = fail(content);
    if (violation) {
      return NextResponse.json({ error: violation }, { status: 400 });
    }
    const use = content && content.summary ? content : BASELINE;
    const safe = roleTitle
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 50);
    const fileName = safe ? `Vinesh_Resume_${safe}.pdf` : "Vinesh_Resume.pdf";

    // Compile, then guarantee one page: if the rewritten content spills over,
    // shrink profile-style (drop JD-added skill items first, then trim the
    // longest skill lines) and recompile. Never touches frozen structure.
    let current: ResumeContent = use;
    let { pdf, pages } = await compileToPdf(fillTemplate(current));
    const hasNum = (x: string) => /\d/.test(x);
    for (
      let shrinkPass = 0;
      shrinkPass < 4 && pages !== null && pages > 1;
      shrinkPass++
    ) {
      // pass 0: skills back to baseline count
      // pass 1: skills baseline-1; summary toward baseline length
      // pass 2: bullets toward baseline length (non-numeric tail first)
      // pass 3: harder caps â€” skills baseline-2, summary 0.9x, bullets 0.9x,
      //         numeric tail sentences droppable as a last resort
      const skillTarget = (i: number) => {
        const base = BASELINE.skills[i].items.length;
        if (shrinkPass === 0) return base;
        if (shrinkPass <= 2) return Math.max(base - 1, 3);
        return Math.max(base - 2, 3);
      };
      const hard = shrinkPass >= 3;
      const summaryCap = BASELINE.summary.length * (hard ? 0.9 : 1.0);
      const bulletCap = (before: string) =>
        before.length * (hard ? 0.9 : 1.0) + 30;
      // Tail-trim: drop last sentences toward the cap, preferring non-numeric
      // ones; on the hard pass numeric tail sentences may go too â€” the
      // one-page guarantee wins over an over-inflated rewrite, while bullets
      // that fit their cap are never touched.
      const tailTrim = (v: string, cap: number): string => {
        if (v.length <= cap) return v;
        const sentences = v.split(/(?<=\.)\s+/);
        const kept = [...sentences];
        while (kept.length > 1 && kept.join(" ").length > cap) {
          const last = kept[kept.length - 1];
          if (!hard && hasNum(last)) break;
          kept.splice(kept.length - 1, 1);
        }
        const out = kept.join(" ");
        return out.length > cap && out === v ? v : out;
      };
      current = {
        ...current,
        summary: tailTrim(current.summary, summaryCap),
        skills: current.skills.map((line, i) => ({
          ...line,
          items: [...line.items].slice(0, skillTarget(i)),
        })),
        projects: current.projects.map((p, i) => ({
          ...p,
          bullets: p.bullets.map((b, j) =>
            tailTrim(b, bulletCap(BASELINE.projects[i].bullets[j]))
          ),
        })),
      };
      const again = await compileToPdf(fillTemplate(current));
      pdf = again.pdf;
      pages = again.pages;
    }
      if (pages !== null && pages > 1) {
        return NextResponse.json(
          {
            error:
              "This edit makes the resume spill past one page even after tightening. Try optimizing again â€” the model will be asked for shorter wording.",
          },
          { status: 502 }
        );
      }
    // (the shrunken profile lives only in the served PDF; the UI keeps its
    // own copy, which may differ â€” acceptable: it is the delivered document)
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Edito-Pages": String(pages ?? "unknown"),
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const e = err as Error;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
