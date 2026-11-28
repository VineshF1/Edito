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

// Typographic squeeze ladder — applied ONLY to the compiled document's
// spacing knobs when content overflows, before any trimming. Level 0 is the
// frozen frame untouched. All values are absolute for their level so each
// application is a fresh, deterministic set of string replacements.
export type SpacingProfile = {
  margin: string;
  itemsep: string;
  topsep: string;
  sectionBefore: string;
  sectionAfter: string;
  linespread: string;
  nameFont?: [string, string];
};

export const SPACING_LEVELS: (SpacingProfile | null)[] = [
  null, // 0: frozen frame as-is
  { margin: "0.47in", itemsep: "1.5pt", topsep: "2pt", sectionBefore: "6pt", sectionAfter: "2pt", linespread: "0.95" },
  { margin: "0.44in", itemsep: "1pt", topsep: "2pt", sectionBefore: "5pt", sectionAfter: "2pt", linespread: "0.93", nameFont: ["23pt", "25pt"] },
  { margin: "0.4in", itemsep: "0.5pt", topsep: "1.5pt", sectionBefore: "4pt", sectionAfter: "1.5pt", linespread: "0.91" },
  { margin: "0.35in", itemsep: "0.5pt", topsep: "1pt", sectionBefore: "4pt", sectionAfter: "1.5pt", linespread: "0.89", nameFont: ["22pt", "24pt"] },
];

function sw(tex: string, from: string, to: string): string {
  return tex.split(from).join(to);
}

export function applySpacingProfile(tex: string, level: number): string {
  const p = SPACING_LEVELS[level];
  if (!p) return tex;
  let out = tex;
  out = sw(out, "\\usepackage[margin=0.5in]{geometry}", `\\usepackage[margin=${p.margin}]{geometry}`);
  out = sw(
    out,
    "\\setlist[itemize]{leftmargin=*, itemsep=2pt, topsep=3pt, parsep=0pt}",
    `\\setlist[itemize]{leftmargin=*, itemsep=${p.itemsep}, topsep=${p.topsep}, parsep=0pt}`
  );
  out = sw(
    out,
    "\\titlespacing*{\\section}{0pt}{8pt}{3pt}",
    `\\titlespacing*{\\section}{0pt}{${p.sectionBefore}}{${p.sectionAfter}}`
  );
  out = sw(out, "\\linespread{0.97}", `\\linespread{${p.linespread}}`);
  if (p.nameFont) {
    out = sw(
      out,
      "{\\fontsize{24}{26}\\selectfont\\scshape",
      `{\\fontsize{${p.nameFont[0]}}{${p.nameFont[1]}}\\selectfont\\scshape`
    );
  }
  return out;
}

export { BASELINE };
