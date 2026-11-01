# Edito

A private resume-tailoring tool: paste a job description (text or URL), an
LLM rewrites selected parts of a fixed resume, and the result is rebuilt with
LaTeX into a one-page, text-extractable PDF — plus a tab that drafts job
application emails from the same resume data.

## How it works

1. **Input** — paste a job description as text, or a link (the server fetches
   the page with SSRF protection and restricts parsing to HTML content types).
2. **Keyword pass** — `nvidia/nemotron-3.5-super-vl-120b-a12b` returns the role
   title and up to 25 ATS keywords from the JD (JSON mode, with a second
   free-form attempt if parsing fails). Reasoning is disabled via
   `chat_template_kwargs` to keep latency near single-digit seconds.
3. **Write pass** — the same model rewrites **only**:
   - the Summary
   - the values inside each Skill line (labels and order are fixed)
   - the wording of project bullets (fixed count per project)
   Name, contact, links, project titles, education, certifications and the
   entire layout are frozen LaTeX — the LLM never touches them.
4. **Validation** — the server rejects output that changes skill labels,
   reorders skills, alters project ids, changes bullet counts, or drops any
   numeric metric that appeared in an original bullet. Skill items the
   baseline resume cannot support are dropped, and per-bullet plus
   whole-document length budgets are applied.
5. **Scoring** — before/after numbers are reported: the score is keyword
   coverage over the subset the extraction flagged `important` (all extracted
   keywords if too few are flagged; chips show every keyword). It is a
   self-consistency metric for this tool, not a prediction of how any real
   ATS would rank the document.
6. **Compile** — the edited JSON is injected into the frozen `.tex` frame
   (engine-guarded so it builds identically under Tectonic and pdfLaTeX) and
   compiled with the vendored Tectonic binary. The PDF is served with a
   role-derived filename: `Vinesh_Resume_<Role_Title>.pdf`.

### One-page guarantee

The frozen template is a one-page layout. The compile step keeps your content
intact first, and only tightens things if needed, in this order:

1. **Typography ladder** (content untouched): up to four spacing profiles —
   margins 0.5"→0.35", linespread 0.97→0.89, tighter list/section spacing,
   smaller name type — recompiling after each step until it fits.
2. **Content budgeting** at optimize time (skill-line caps, per-bullet caps,
   whole-document budget with tail trims that prefer keeping numeric
   sentences).
3. If it still overflows, the compile route shrinks content progressively
   (skills → summary → bullet tails) and recompiles.
4. Last resort: the request returns an error asking for a regeneration — a
   two-page resume is never served.

### Email Writer

Drafts application / recruiter-reply / follow-up emails from the cover-letter
rules in `lib/prompts.ts` (hook → value → fit → ask, 250–350 words) using the
resume JSON as the only source of facts. Email bodies are editable before
copying or downloading. JSON mode plus a validated retry pass; if no valid
body is produced, the route returns 502.

## Security

- **SSRF protection** on URL fetching: private/reserved IP ranges, non-HTTP
  schemes and embedded credentials are blocked; responses are capped at 1.5 MB
  and restricted to HTML content types (`lib/jd-source.ts`).
- **Rate limiting** per IP: 10 req/min on optimize and email, 20 req/min on
  compile (`lib/ratelimit.ts`).
- **Strict input validation** on everything the LLM produces before it reaches
  the LaTeX template; TeX is assembled only from validated JSON
  (`lib/latex.ts`) — no free-form user text is interpolated into the template.
- **Security headers** (CSP, X-Frame-Options, nosniff, Referrer-Policy,
  Permissions-Policy) set in `next.config.mjs`.

## Tech stack

- Next.js 15 (App Router) · React 19 · TypeScript (strict)
- Tailwind CSS v4
- Tectonic 0.17.0, vendored — Windows binary plus Linux x86_64 / arm64 musl
  builds; the compile step selects by platform and architecture (and restores
  the executable bit on Linux). No TeX Live / MiKTeX install required.

## Getting started (local)

```bash
npm install
# put your NVIDIA API key into a file named .env (copy the shape from
# .env.example) — get one at build.nvidia.com
npm run dev        # http://localhost:3000
```

`.env` is git-ignored; `.env.example` documents the variable name only.

## Deploying to Vercel

1. Push the repo (this one) and import it at vercel.com → Add New Project.
2. Add the environment variable `NVIDIA_API_KEY` (Production and Preview).
3. Deploy with the default Next.js settings.

Notes:

- The Linux Tectonic binaries ship with the compile serverless function via
  `outputFileTracingIncludes`; the cache is kept under `/tmp` on Linux.
- The first compile on a cold function downloads Tectonic's LaTeX bundle to
  `/tmp` and is slower; warm invocations reuse it.
- `maxDuration: 120` in the compile route is clamped to 60 s on Vercel's Hobby
  plan; measured compile time after the first call is a few seconds.
- The GitHub repo must stay private — the baseline resume (name, contact,
  education) lives in `lib/resume-baseline.ts` by design.

## Project structure

| Path | Purpose |
|---|---|
| `app/` | App Router pages and the `optimize`, `compile`, `email` API routes |
| `app-data/resume-frame.tex` | Frozen LaTeX frame with `{{SUMMARY}}` `{{SKILLS}}` `{{PROJECTS}}` tokens |
| `lib/resume-baseline.ts` | The baseline resume content (source of truth for validation) |
| `lib/prompts.ts` | Keyword, rewriter and email rule sets |
| `lib/nim.ts` | NVIDIA NIM client: model list, transport retries, JSON extraction/repair |
| `lib/latex.ts` | JSON → LaTeX assembly with escaping |
| `lib/compile.ts` | Tectonic invocation and page counting |
| `lib/jd-source.ts` | URL → JD text fetch with SSRF guard |
| `components/` | Optimizer and Email Writer UI (paper-editorial theme, tab slide transitions) |
| `reference/` | The original `.tex` the frame was built from (compiled artifacts kept out of git) |
| `scripts/e2e.js` | End-to-end smoke test: JD URL → optimize → compile → saved PDF |

## Models

| Role | Model | Notes |
|---|---|---|
| Writer + keywords (primary) | `nvidia/nemotron-3.5-super-vl-120b-a12b` | `chat_template_kwargs: { enable_thinking: false }` |
| Fallback writer | `openai/gpt-oss-20b` | `reasoning_effort: "low"`; used automatically if the primary fails |

The UI shows which model produced a given result. Ruled out during testing:
`nemotron-3.5-lightning-30b-a3b` (reasoning consumes the token budget and
returns `content: null`), and `deepseek-v4.1-flash`, `stepfun-ai/step-5-preview`,
`nemotron-3-nano-omni-30b-a3b-reasoning` (endpoint hang at 120 s+).

## Testing

Runs the full pipeline against a JD URL you pass in, saves `scripts/e2e-out.pdf`,
and prints the model used, scores, and compile status. Page count and metric
preservation can be checked with any PDF text extractor:

```bash
node scripts/e2e.js https://example.com/careers/some-role
```

## Known limitations

- The ATS score is keyword-overlap only; treat it as a before/after signal for
  this tool's own rewrite, not an ATS-vendor simulation.
- Rewording quality varies between model runs; validation guarantees structure
  and facts, not style. Accept a run, or regenerate.
- The email writer follows generic cover-letter rules; there is no
  personal-template support yet.
- Keyword extraction can pick up JD terms the resume cannot honestly claim;
  the skill-coverage filter drops those rather than inventing experience.
