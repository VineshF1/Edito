// Edito — LaTeX resume template (frozen structure).
// Only content inside {{PLACEHOLDER}} tokens is rewritten. Everything else
// (preamble, spacing, section commands, header, education, certifications)
// is frozen so format never changes.

export const HEADER = `Kurma Lakshmi Narasimha Vinesh
+91-9398948695
vinesharceus@gmail.com
linkedin.com/in/vinesh007
github.com/VineshF1
vinesh007.vercel.app`;

export const TEMPLATE_PREAMBLE = `\\documentclass[letterpaper,11pt]{article}
\\usepackage[margin=0.5in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{anyfontsize}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
% Engine-safe ToUnicode map: active under pdfLaTeX, skipped under Tectonic/XeTeX
\\makeatletter
\\@ifundefined{pdfglyphtounicode}{}{%
  \\input{glyphtounicode}%
  \\pdfgentounicode=1
}
% Under Tectonic/XeTeX: use Latin Modern OpenType with common ligatures (fi, fl, ffi...)
% disabled so "Artificial"/"fine-tuning" copy out as plain ASCII for ATS parsers.
\\ifdefined\\XeTeXrevision
  \\usepackage{fontspec}
  \\setmainfont{lmroman10-regular.otf}[
    BoldFont=lmroman10-bold.otf,
    ItalicFont=lmroman10-italic.otf,
    BoldItalicFont=lmroman10-bolditalic.otf,
    SmallCapsFont=lmromancaps10-regular.otf,
    Ligatures=NoCommon]
  \\setmonofont{lmmono10-regular.otf}[Ligatures=NoCommon]
  \\hyphenpenalty=10000
\\fi
\\makeatother

\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlist[itemize]{leftmargin=*, itemsep=2pt, topsep=3pt, parsep=0pt}
\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]
\\titlespacing*{\\section}{0pt}{8pt}{3pt}
\\linespread{0.97}

\\begin{document}
\\begin{center}
{\\fontsize{24}{26}\\selectfont\\scshape Kurma Lakshmi Narasimha Vinesh}\\\\[3pt]
+91-9398948695 \\hspace{0.8em} \\$\\vert\\$ \\hspace{0.8em}
\\href{mailto:vinesharceus@gmail.com}{vinesharceus@gmail.com} \\hspace{0.8em} \\$\\vert\\$ \\hspace{0.8em}
\\href{https://linkedin.com/in/vinesh007}{linkedin.com/in/vinesh007}\\\\[2pt]
\\href{https://github.com/VineshF1}{github.com/VineshF1} \\hspace{0.8em} \\$\\vert\\$ \\hspace{0.8em}
\\href{https://vinesh007.vercel.app}{vinesh007.vercel.app}
\\end{center}`;

export const TEMPLATE_MID = `\\section*{Certifications}
\\begin{itemize}
\\item \\textbf{Introduction to Python} - GUVI (2025)
\\item \\textbf{Oracle Agentic AI Foundations Associate} - Oracle (2026)
\\item \\textbf{Hugging Face Agents Course} - Hugging Face (2026)
\\end{itemize}

\\section*{Education}
{\\bfseries B.Tech (Artificial Intelligence \\& Machine Learning):} Sri Vasavi Inst.\\ of Engg.\\ \\& Tech., Nandamuru
\\hfill {2027}\\\\
CGPA: 7.94\\\\[1pt]
{\\bfseries Intermediate:} Pavithra Co-Op Junior College, Machilipatnam
\\hfill {2023}\\\\
Percentage: 85.4\\%\\\\[1pt]
{\\bfseries SSC:} Dr.\\ KKR Gowtham School, Machilipatnam
\\hfill {2021}\\\\
Percentage: 99\\%

\\end{document}`;
