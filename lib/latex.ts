// Edito — LaTeX assembly. Escapes plain-text content and injects it into the
// frozen frame. Structure outside {{SUMMARY}} {{SKILLS}} {{PROJECTS}} is byte-identical
// to the user's original .tex.

import fs from "node:fs";
import path from "node:path";
import {
  BASELINE,
  PROJECT_META,
  type ResumeContent,
} from "./resume-baseline";

export function escapeLaTeX(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/([\u2018\u2019])/g, "'")
    .replace(/([\u201C\u201D])/g, '"')
    .replace(/[\u2013\u2014]/g, "--")
    .replace(/[\u2022]/g, "");
}

// Things that must NOT be escaped because they are already LaTeX tokens
// (e.g. the frozen project title lines with \textbf, \href, unions of links).
function latexLine(s: string): string {
  return s;
}

function buildSkillsLatex(c: ResumeContent): string {
  return c.skills
    .map(
      (line) =>
        `\\textbf{${escapeLaTeX(line.label)}:} ${line.items
          .map(escapeLaTeX)
          .join(", ")}`
    )
    .join("\\\\\n");
}

function buildProjectsLatex(c: ResumeContent): string {
  const blocks = PROJECT_META.map((meta) => {
    const proj = c.projects.find((p) => p.id === meta.id);
    if (!proj) throw new Error(`missing project content for ${meta.id}`);
    const items = proj.bullets
      .map((b) => `\\item ${escapeLaTeX(b)}`)
      .join("\n");
    return `${latexLine(meta.titleLatex)}\n\\begin{itemize}\n${items}\n\\end{itemize}`;
  });
  return blocks.join("\n\\vspace{2pt}\n\n");
}

export function fillTemplate(c: ResumeContent): string {
  const framePath = path.join(process.cwd(), "app-data", "resume-frame.tex");
  const frame = fs.readFileSync(framePath, "utf8");
  return frame
    .replace("{{SUMMARY}}", escapeLaTeX(c.summary))
    .replace("{{SKILLS}}", buildSkillsLatex(c))
    .replace("{{PROJECTS}}", buildProjectsLatex(c));
}

export { BASELINE };
