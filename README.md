# Edito

Private, local tool: paste a job description → get a JD-tailored, ATS-friendly
resume PDF (exact same layout, LaTeX-rebuilt) + job application emails.

## What it does

**Resume Optimizer**
1. You paste a job description (text or a URL — the page is fetched and the
   JD text extracted, with SSRF protection).
2. `nvidia/nemotron-3.5-super-vl-120b-a12b` extracts ATS keywords and the
   role title (thinking disabled via `chat_template_kwargs`).
3. The same model rewrites **only**:
   - the Summary (target-role formula)
   - the Skill line values (JD terminology, grouped, never invented)
   - project bullet wording (Action + What + Tool + Result)
   - everything else — name, contact, links, project titles, certifications,
     education, layout — is frozen LaTeX and never touched.
4. Before/after ATS score + matched/missing keyword chips.
5. The edited content is injected into your original `.tex` frame (with an
   engine-guard so it compiles identically under Tectonic and pdfLaTeX),
   compiled with Tectonic, and served as a downloadable PDF named
   `Vinesh_Resume_<Role_Title>.pdf`.

Safety rails (hard-rejected by the server, not just prompted):
- skill labels/order/bullet counts/project ids can't change
- original metrics/numbers in bullets must survive verbatim
- skill items the resume can't support are dropped; per-bullet and
  whole-document length budgets keep the output one page
- if the compiled PDF still spills past one page, the compile step shrinks
  profile-style (skills first, then bullet tails) and recompiles; it never
  returns a two-page resume

**Email Writer** — application / recruiter-reply / follow-up emails following
the cover-letter rules (hook → value → fit → ask, 250–350 words, no invented
facts; resume JSON is the only source of truth). Edit before sending, copy or
download.

## Setup

```
npm install
copy .env.example .env.local   # put your NVIDIA API key in
npm run dev                    # http://localhost:3000
```

Tectonic is vendored in `tools/tectonic/` — no TeX Live/MiKTeX install needed.

## Files of interest

| Path | What |
|---|---|
| `app-data/resume-frame.tex` | The frozen LaTeX frame (`{{SUMMARY}}`, `{{SKILLS}}`, `{{PROJECTS}}` tokens) |
| `lib/resume-baseline.ts` | Baseline content — the only place content edits flow from |
| `lib/prompts.ts` | Rule set (checklist + HireRaft blog guides, condensed) |
| `reference/` | Your original PDF + .tex and compiled parity-check renders |

## Models

| Role | Model | Notes |
|---|---|---|
| Writer + keywords (primary) | `nvidia/nemotron-3.5-super-vl-120b-a12b` | thinking off via `chat_template_kwargs: {enable_thinking: false}`; fast (single-digit seconds), RL-trained on structured output |
| Fallback writer | `openai/gpt-oss-20b` | `reasoning_effort: "low"`, used automatically if the primary fails |

Tested and rejected: `nemotron-3.5-lightning` (burns token budget on
reasoning, returns `content: null`), `deepseek-v4.1-flash`, `step-5-preview`,
`nemotron-3-nano-omni` (endpoints hang 120s+).
