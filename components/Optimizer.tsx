"use client";

import { useEffect, useState } from "react";

type Keyword = { term: string; important: boolean };

type Result = {
  keywords: Keyword[];
  matchedBefore: string[];
  missingBefore: string[];
  scoreBefore: number;
  scoreAfter: number;
  usedWriter: string;
  roleTitle: string;
  matchedAfter: string[];
  missingAfter: string[];
  edits: {
    summary: string;
    summaryAfter: string;
    skills: { label: string; items: string[] }[];
    projects: { id: string; bullets: string[] }[];
    summaryBefore: string;
    skillDiffs: { label: string; before: string; after: string }[];
    bulletDiffs: { id: string; project: string; before: string[]; after: string[] }[];
  };
};

const STEP_LABELS = [
  "Reading the job description for ATS keywords",
  "Rewriting summary, skills and project wording",
  "Scoring before and after",
];

function ScoreRing({ label, score }: { label: string; score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * c;
  const color =
    score >= 85 ? "var(--accent)" : score >= 70 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="panel flex items-center gap-4 p-4 sm:p-5">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="flex-none">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle
          className="score-ring"
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div>
        <p className="kicker">{label}</p>
        <p className="num font-display text-3xl font-semibold leading-tight" style={{ color }}>
          {score}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {score >= 85 ? "strong match" : score >= 70 ? "competitive" : "weak match"}
        </p>
      </div>
    </div>
  );
}

export default function Optimizer() {
  const [jd, setJd] = useState("");
  const [model, setModel] = useState<"primary" | "alt">("primary");
  const [loading, setLoading] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Mobile browsers (Android Chrome, iOS Safari) render PDF blobs poorly or
  // not at all inside iframes — swap the preview for open/download actions.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Local history of generated resumes (stays on this device; regenerating
  // the PDF works anytime, so a deleted download is never a lost result).
  type HistoryEntry = {
    ts: number;
    roleTitle: string;
    scoreBefore: number;
    scoreAfter: number;
    jdExcerpt: string;
    result: Result;
  };
  const HISTORY_KEY = "edito-history-v1";
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // storage unavailable — history silently disabled
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function saveHistory(data: Result, jdText: string) {
    setHistory((prev) => {
      const entry: HistoryEntry = {
        ts: Date.now(),
        roleTitle: data.roleTitle,
        scoreBefore: data.scoreBefore,
        scoreAfter: data.scoreAfter,
        jdExcerpt: jdText.replace(/\s+/g, " ").slice(0, 120),
        result: data,
      };
      const next = [entry, ...prev.filter((e) => e.result.edits?.summary !== entry.result.edits?.summary)].slice(0, 12);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // quota/off — keep in-memory only
      }
      return next;
    });
  }
  function dropHistory(ts: number) {
    setHistory((prev) => {
      const next = prev.filter((e) => e.ts !== ts);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }
  function restore(entry: HistoryEntry) {
    setPdfUrl(null);
    setError("");
    setResult(entry.result);
    setJd((j) => j || entry.jdExcerpt);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function optimize() {
    setError("");
    setResult(null);
    setPdfUrl(null);
    if (jd.trim().length < 30) {
      setError("Paste a job description first — at least a few full sentences.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Optimization failed");
      setResult(data);
      saveHistory(data, jd);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function compile() {
    if (!result) return;
    setError("");
    setCompiling(true);
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: {
            summary: result.edits.summary,
            skills: result.edits.skills,
            projects: result.edits.projects,
          },
          roleTitle: result.roleTitle,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Compile failed");
      }
      setPdfUrl(URL.createObjectURL(await res.blob()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCompiling(false);
    }
  }

  const changedSkillCount =
    result?.edits.skillDiffs.filter((s) => s.before !== s.after).length ?? 0;

  return (
    <div className="space-y-7">
      {/* Intro */}
      <div className="max-w-2xl">
        <p className="kicker mb-1">Resume optimizer</p>
        <h2 className="font-display text-2xl font-semibold leading-snug">
          One job description in, one tailored resume out. Same layout, always.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
          Only the summary, skills and project wording are rewritten. Structure,
          contact details, education and the typesetting stay exactly as they were.
          Facts can’t be invented — the server rejects any edit that changes your
          metrics.
        </p>
      </div>

      {/* Input */}
      <section className="panel p-4 sm:p-6">
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <label htmlFor="jd" className="kicker">
            Job description
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            Writer model
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as "primary" | "alt")}
              className="px-2 py-1 text-xs"
            >
              <option value="primary">Nemotron 3.5 Super VL 120B</option>
              <option value="alt">GPT-OSS-20B</option>
            </select>
          </label>
        </div>
        <textarea
          id="jd"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={7}
          placeholder="Paste the full posting — responsibilities, requirements, the stack, everything. A link works too: paste just the URL on its own line."
          className="w-full resize-y p-3 text-sm leading-relaxed"
        />
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          Posting online? Paste its link instead of the text; the page is parsed
          on this machine. Links to private or internal network addresses are
          refused.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={optimize} disabled={loading} className="btn-primary px-5 py-2.5 text-sm">
            {loading ? "Working…" : "Optimize for this role"}
          </button>
          {jd && !loading && (
            <button
              onClick={() => {
                setJd("");
                setResult(null);
                setPdfUrl(null);
                setError("");
              }}
              className="btn-ghost px-4 py-2.5 text-sm"
            >
              Clear
            </button>
          )}
          <span className="num text-xs text-[var(--muted)]">
            {jd.trim() ? `${jd.trim().split(/\s+/).length} words` : "text or link to the posting"}
          </span>
        </div>
        {result?.usedWriter && (
          <p className="num mt-1 text-[11px] text-[var(--muted)]">
            written by {result.usedWriter}
          </p>
        )}

        {loading && (
          <div className="mt-5 space-y-4" aria-live="polite">
            {STEP_LABELS.map((s, i) => (
              <div key={s} className="flex items-start gap-3">
                <span className={`step-dot ${i === 0 ? "spin" : "done"}`} />
                <span
                  className={`text-xs ${i === 0 ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}
                >
                  {s}
                </span>
              </div>
            ))}
            <div className="space-y-2 pt-1">
              <div className="skeleton-line h-3 w-11/12" />
              <div className="skeleton-line h-3 w-9/12" />
              <div className="skeleton-line h-3 w-10/12" />
            </div>
          </div>
        )}

        {error && (
          <p
            className="mt-4 rounded-xl border border-[#e3c3bd] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger)]"
            role="alert"
          >
            {error}
          </p>
        )}
      </section>

      {/* Results */}
      {result && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:gap-4">
            <ScoreRing label="ATS score · before" score={result.scoreBefore} />
            <ScoreRing label="ATS score · after" score={result.scoreAfter} />
            <p className="col-span-2 text-center text-xs text-[var(--muted)]">
              Score = coverage of the keywords the JD analysis flagged
              important (chips below show every keyword).
            </p>
          </section>

          <section className="panel p-4 sm:p-6">
            <h3 className="kicker mb-4">Keyword coverage</h3>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="num mb-2 text-sm font-medium text-[var(--accent)]">
                  Matched · {result.matchedAfter.length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.matchedAfter.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-[var(--ink-2)]">
                  Not matched · {result.missingAfter.length}
                </p>
                <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">
                  Deliberately excluded — the resume doesn’t have the evidence
                  for these. Listing them would be keyword stuffing, and that
                  fails interviews.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.missingAfter.map((t) => (
                    <span key={t} className="chip-miss chip">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Summary */}
          <section className="panel p-4 sm:p-6">
            <h3 className="kicker mb-4">Summary</h3>
            <p className="del mb-2 rounded-r-xl p-3 text-xs leading-relaxed">
              {result.edits.summaryBefore}
            </p>
            <p className="ins rounded-r-xl p-3 text-xs leading-relaxed">
              {result.edits.summaryAfter}
            </p>
          </section>

          {/* Skills */}
          <section className="panel p-4 sm:p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="kicker">Skills</h3>
              <span className="num text-xs text-[var(--muted)]">
                {changedSkillCount} of {result.edits.skillDiffs.length} lines adjusted
              </span>
            </div>
            <div className="space-y-4">
              {result.edits.skillDiffs.map((s) => (
                <div key={s.label}>
                  <p className="mb-1.5 text-xs font-semibold">{s.label}</p>
                  {s.before !== s.after ? (
                    <>
                      <p className="del rounded-r-xl p-2.5 text-xs leading-relaxed">
                        {s.before}
                      </p>
                      <p className="ins mt-1 rounded-r-xl p-2.5 text-xs leading-relaxed">
                        {s.after}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs leading-relaxed text-[var(--ink-2)]">
                      {s.after}
                      <span className="ml-2 text-[var(--muted)]">— unchanged</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Projects */}
          <section className="panel p-4 sm:p-6">
            <h3 className="kicker mb-4">Project bullets</h3>
            <div className="space-y-6">
              {result.edits.bulletDiffs.map((p) => (
                <div key={p.id}>
                  <p className="font-display mb-1.5 text-sm font-semibold">
                    {p.project}
                  </p>
                  <ul className="space-y-1.5">
                    {p.after.map((b, i) =>
                      p.before[i] !== b ? (
                        <li key={i}>
                          <details>
                            <summary className="ins cursor-pointer list-none rounded-r-xl px-2.5 py-2 text-xs leading-relaxed">
                              <span className="mr-1.5 text-[var(--accent)]">✎</span>
                              {b}
                            </summary>
                            <p className="del mt-1 ml-4 rounded-r-xl p-2 text-[11px] leading-relaxed">
                              {p.before[i]}
                            </p>
                          </details>
                        </li>
                      ) : (
                        <li
                          key={i}
                          className="px-2.5 py-2 text-xs leading-relaxed text-[var(--muted)]"
                        >
                          {b}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Compile */}
          <section className="panel p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={compile}
                disabled={compiling}
                className="btn-primary px-5 py-2.5 text-sm"
              >
                {compiling ? "Typesetting…" : "Typeset the PDF"}
              </button>
              <span className="text-xs text-[var(--muted)]">
                Compiled from the original LaTeX locally — nothing is uploaded.
              </span>
            </div>
            {compiling && (
              <div className="mt-4 space-y-2">
                <div className="skeleton-line h-[420px] w-full max-w-[560px] rounded-xl" />
              </div>
            )}
            {pdfUrl && (
              <div className="mt-5">
                {isMobile && (
                  <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
                    Phones don't render PDF previews inside the page — open it
                    in a viewer app (or your browser's PDF chrome) instead.
                  </p>
                )}
                <div className="overflow-hidden rounded-xl border border-[var(--line-2)] shadow-sm">
                  {isMobile ? (
                    <div className="flex flex-col gap-3 p-5">
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary px-5 py-3 text-sm text-center"
                      >
                        Open resume PDF
                      </a>
                      <span className="text-xs text-center text-[var(--muted)]">
                        Open it, screenshot it, or download it below.
                      </span>
                    </div>
                  ) : (
                    <iframe
                      src={pdfUrl}
                      title="Resume preview"
                      className="h-[520px] w-full bg-white sm:h-[735px]"
                    />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <a
                    href={pdfUrl}
                    download={(() => {
                      const t = (result.roleTitle || "")
                        .replace(/[^\w\s-]/g, "")
                        .trim()
                        .replace(/\s+/g, "_")
                        .slice(0, 50);
                      return t && t.toLowerCase() !== "resume"
                        ? `Vinesh_Resume_${t}.pdf`
                        : "Vinesh_Resume.pdf";
                    })()}
                    className="btn-primary px-5 py-2.5 text-sm"
                  >
                    Download PDF
                  </a>
                  {isMobile && (
                    <button
                      onClick={() => window.open(pdfUrl, "_blank")}
                      className="btn-ghost px-4 py-2.5 text-sm"
                    >
                      Open in viewer
                    </button>
                  )}
                  <span className="text-xs text-[var(--muted)]">
                    Before submitting: copy all text from the PDF into a blank
                    document — if it reads clean, the ATS will read it clean.
                  </span>
                </div>
              </div>
            )}
          </section>
          {history.length > 0 && (
            <section className="panel p-4 sm:p-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="kicker">Generated on this device</h3>
                <span className="text-[11px] text-[var(--muted)]">
                  Nothing leaves your machine; re-download anytime
                </span>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {history.map((h) => (
                  <li key={h.ts} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {h.roleTitle}
                      </p>
                      <p className="truncate text-[11px] text-[var(--muted)]">
                        {new Date(h.ts).toLocaleString()} · {h.scoreBefore}→
                        {h.scoreAfter} · {h.jdExcerpt}
                      </p>
                    </div>
                    <button
                      onClick={() => restore(h)}
                      className="btn-ghost flex-none px-3 py-1.5 text-xs"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => dropHistory(h.ts)}
                      className="btn-ghost flex-none px-3 py-1.5 text-xs"
                      aria-label="Remove from history"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
