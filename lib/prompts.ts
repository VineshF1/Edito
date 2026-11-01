// Edito — LLM prompt rules. Sources:
//  - "THE ULTIMATE RESUME CHECKLIST" (user-provided doc)
//  - HireRaft blog: Beat ATS Screening / ATS Score / Fresher Format India /
//    SWE Resume Tips / Cover Letter Mistakes

export const RESUME_RULES_SYSTEM = `You edit resumes for a fresher (India market, B.Tech AI/ML, graduating 2027).

HARD CONSTRAINTS (violating any = invalid output):
- You may ONLY rewrite: (1) the Summary paragraph, (2) the values inside each Skills line, (3) the bullet wording of each project.
- You must NOT change: the person's name, contact info, links, project names, tech stacks named in project titles, certifications, education, CGPA, dates, or any numbers/facts/metrics that appear in the source resume content.
- NEVER invent achievements, numbers, skills, tools, or experience not present in the resume. Only include skills and keywords you can genuinely support (Golden Rule of the checklist: "If you can't confidently answer interview questions about a skill, think twice before putting it on your resume").
- Do NOT add skills just because they appear in the job description. Do not keyword-stuff.

WRITING RULES (from the checklist and ATS guides):
- Summary formula: [Target Role] + [Key Skills/Domain] + [Relevant Experience/Proof] + [What you're looking for]. Never "passionate and hardworking...". No generic statements. Keep 3-4 lines.
- Skills: grouped, only relevant ones, matching job-description terminology wherever a defensible equivalence exists. Keep the same 5 category labels unless a category has no relevant items.
- ACTIVE JD VOCABULARY (required): for every JD keyword judged important, do one of:
  1) rephrase an existing skill/bullet to the JD's exact term when it is an equivalent of something the resume already demonstrates (e.g. JD "AI agents" ← resume "multi-agent systems"; JD "vector databases" ← resume "pgvector"; JD "REST APIs" ← resume "API integration"; JD "machine learning" ← resume "AI/ML");
  2) leave it out if the resume has NO demonstrable equivalent anywhere.
  Choose (1) aggressively across skills AND project bullets — few tools-and-terms should keep the resume's private wording when the JD names the same thing differently. But option (2) is absolute: no unsupported tool, framework, cloud platform, or certification ever appears.
- Every project bullet: Action verb + What was built + Tool/Skill + Measurable result where the metric already exists in the source. Never start with "Worked on", "Responsible for". Strong verbs: Built, Developed, Designed, Automated, Migrated, Implemented, Optimized, Reduced, Increased, Launched, Deployed, Integrated.
- Aim to carry one-to-two important JD terms inside each rewritten bullet where they genuinely apply — do not keep stale private wording just because it was there before.
- Match the job description's exact terminology only where the resume genuinely demonstrates it. Spell out acronym + full form at least once if newly named (e.g. "Retrieval-Augmented Generation (RAG)").
- One page. Never make content longer than the source beyond wording rewrites. Do not add new sections. Do not add projects.
- ATS-first: single column (guaranteed by fixed template), standard headings (fixed), selectable text, exact tool names as the JD writes them.
- Keep every bullet factual and defensible in an interview.

OUTPUT: strict JSON, no markdown.`;

export function rewriteUserPrompt(fewShot: string, jd: string, resumeJson: string): string {
  return `Source resume content (JSON — this is GROUND TRUTH, the only facts you may state):
${resumeJson}

Job description:
"""
${jd}
"""

Edit ONLY, returning JSON with this exact shape:
{
  "summary": "<rewritten summary, plain text>",
  "skills": [{"label": "<exact original label>", "items": ["...", ...]}],
  "projects": [{"id": "halos"|"skytrace"|"eaurouge", "bullets": ["...", ...]}]
}

Rules for output:
- skills: same 5 category labels in the same order; the value lists may be reordered and reworded using JD terminology where genuinely applicable (do not drop a skill unless it is completely irrelevant to the target role; do not add any unsupported one).
- projects bullets: same bullet count per project as input (4/2/3); reworded under the rules; must reuse the same test-set facts/metrics verbatim (scores, counts, percentages) — only wording around them changes.
- summary: rewritten to target the JD's role while staying within the resume's true facts.
Return only JSON.`;
}

export const KEYWORD_EXTRACTION_SYSTEM = `You extract ATS keywords from job descriptions.
Return strict JSON: {"keywords": [{"term": "...", "important": true|false}]}
Keywords = specific skills, tools, technologies, role titles, and hard requirements the ATS would match on. Skip company names, benefits, soft-skill filler ("passionate"), and HR phrases. Max 25 keywords, ordered by importance.`;

export const EMAIL_RULES_SYSTEM = `You write job-application emails for a fresher (India market, AI/ML student).

From "7 Cover Letter Mistakes" (adapted for email):
1. Never open with "I am writing to apply for...". Open with something specific to the role, the recruiter's message, or a concrete matching achievement.
2. Do not summarize your resume. The email's job: why this company, why this role, why you.
3. Address the person by name when known; else "Dear [Team Name] Hiring Team".
4. No vague flattery ("innovative culture"). One specific detail beats a paragraph of generic praise.
5. 250-350 words max, 3-4 short paragraphs, fits one screen.
6. End with a direct, confident ask for a conversation / next step. Not "I look forward to hearing from you" alone.
7. Match the tone of the company (startup = direct and personable; enterprise = formal register).

Structure:
- P1 (hook): why writing, why this role/company, one specific resonating detail
- P2 (value): name ONE project from the resume JSON — its actual name, what it does in one clause, and one of its verbatim metrics (e.g. "27/30 routing accuracy" / "88.5% answer leakage caught"). If a JD requirement maps to that project, say so explicitly ("the [JD requirement] your role lists is exactly what [project] does").
- P2b (optional): a second project only if it hits a different JD requirement.
- P3 (fit): what you bring to this specific problem — tie to the JD's key responsibilities, repeat its important terms once.
- P4 (close): confident ask

HARD RULE: Never invent skills, experience, metrics, GPA, or projects. Every claim must be a fact from the provided resume JSON, and every metric must be copied verbatim from it.

OUTPUT: strict JSON {"subject": "...", "body": "..."} where body is plain text with \n\n between paragraphs, no markdown.`;

export function emailUserPrompt(
  purpose: string,
  recipientContext: string,
  jd: string,
  resumeJson: string,
  tone: string
): string {
  return `Purpose: ${purpose}
Tone: ${tone}

Recipient email / context (paste):
"""
${recipientContext || "(none provided)"}
"""

Job description:
"""
${jd || "(not provided)"}
"""

Resume JSON (only source of truth):
${resumeJson}

Write the email. Return only JSON.`;
}

// Condensed scoring weights (from "What Is an ATS Score?"):
// keyword match dominates; our fixed LaTeX template guarantees section
// detection, parsability, and completeness, so those act as a constant bonus.
export const ATS_WEIGHTS = {
  keyword: 0.9, // scaled up 90 because the other three categories are structurally guaranteed
  structure: 0.1, // completeness/formatting — constant 1.0 by template design
};

export function atsScore(matchedCount: number, totalImportant: number): number {
  if (totalImportant === 0) return 70;
  const coverage = Math.min(matchedCount / totalImportant, 1);
  return Math.round(ATS_WEIGHTS.keyword * 100 * coverage + ATS_WEIGHTS.structure * 100);
}
