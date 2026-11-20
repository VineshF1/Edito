// Edito — deterministic writing-quality rubric (adapted from Resume-Matcher's
// "writing score": fixed rules, same result regardless of model). Flags weak
// openers, buzzwords, bullets without an outcome, and bloated lines.

export type WritingIssue = { where: string; issue: string };

const WEAK_OPENERS = [
  "responsible for",
  "worked on",
  "helped",
  "involved in",
  "assisted",
  "participated in",
  "contributed to",
  "led efforts",
];

const BUZZWORDS = [
  "passionate",
  "results-driven",
  "dynamic professional",
  "highly motivated",
  "proven track record",
  "fast-paced environment",
  "synergy",
  "leverage",
  "cutting-edge",
  "world-class",
];

const STRONG_VERBS = [
  "built", "developed", "designed", "automated", "migrated", "implemented",
  "optimized", "reduced", "increased", "launched", "deployed", "integrated",
  "engineered", "validated", "embedded", "fine-tuned", "found", "rebuilt",
];

export function writingScore(parts: {
  summary: string;
  bullets: string[];
}): { score: number; issues: WritingIssue[] } {
  const issues: WritingIssue[] = [];
  const lines = [...parts.bullets.map((b, i) => ({ text: b, where: `Bullet ${i + 1}` }))];
  lines.push({ text: parts.summary, where: "Summary" });

  let score = 100;
  for (const { text, where } of lines) {
    const lower = text.toLowerCase().trim();
    if (WEAK_OPENERS.some((w) => lower.startsWith(w))) {
      issues.push({ where, issue: "Opens with a weak phrase (ownership verb needed)" });
      score -= 8;
    }
    const buzz = BUZZWORDS.find((b) => lower.includes(b));
    if (buzz) {
      issues.push({ where, issue: `Buzzword "${buzz}" reads AI-written` });
      score -= 5;
    }
    if (where !== "Summary") {
      if (!STRONG_VERBS.some((v) => lower.startsWith(v))) {
        issues.push({ where, issue: "Doesn't start with a strong action verb" });
        score -= 6;
      }
      if (!/\d/.test(text)) {
        issues.push({ where, issue: "No metric or outcome number" });
        score -= 6;
      }
    }
    if (text.length > 240) {
      issues.push({ where, issue: "Long line — hard to scan in 6–10 seconds" });
      score -= 4;
    }
  }
  return { score: Math.max(0, Math.min(100, score)), issues: issues.slice(0, 6) };
}
