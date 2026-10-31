"use client";

import { useState } from "react";

const TYPES = [
  { value: "application", label: "New application email" },
  { value: "reply_hr", label: "Reply to recruiter / HR" },
  { value: "followup", label: "Application follow-up" },
  { value: "general", label: "General query" },
];

const TONES = [
  { value: "startup", label: "Startup (direct, personable)" },
  { value: "enterprise", label: "Corporate (formal)" },
  { value: "friendly", label: "Friendly-professional" },
];

export default function EmailWriter() {
  const [type, setType] = useState("application");
  const [tone, setTone] = useState("startup");
  const [model, setModel] = useState<"primary" | "alt">("primary");
  const [to, setTo] = useState("");
  const [context, setContext] = useState("");
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [out, setOut] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setError("");
    setOut(null);
    setCopied(false);
    if (type !== "followup" && context.trim().length < 20 && jd.trim().length < 30) {
      setError("Paste the recruiter's email / context or a job description first.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, tone, to, context, jd, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email generation failed");
      setOut(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-[#9aa3b2]">Email type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#9aa3b2]">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-3 py-2 text-sm"
            >
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#9aa3b2]">Writer model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as "primary" | "alt")}
              className="w-full px-3 py-2 text-sm"
            >
              <option value="primary">Nemotron 3.5 Super VL 120B</option>
              <option value="alt">GPT-OSS-20B</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs text-[#9aa3b2]">
              Recipient (name / team / role — if known)
            </label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="e.g. Priya, HR at Zoho"
              className="w-full px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#9aa3b2]">
              Recipient email / message to reply to (paste here)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={5}
              placeholder="Paste the recruiter's email, the application link + role info, or anything you're replying to…"
              className="w-full resize-y p-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#9aa3b2]">
              Job description (optional but recommended)
            </label>
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={4}
              placeholder="Paste the JD (or its link) so the email can reference the exact role requirements…"
              className="w-full resize-y p-3 text-sm"
            />
          </div>
        </div>

        <button onClick={generate} disabled={loading} className="btn-primary mt-4 px-5 py-2.5 text-sm">
          {loading ? "Writing…" : "Write email"}
        </button>
        {loading && (
          <p className="mt-3 animate-pulse text-xs text-[#9aa3b2]">
            Drafting with the cover-letter rules (hook → value → fit → ask)…
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-xl border border-[#e3c3bd] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </section>

      {out && (
        <section className="panel p-4 sm:p-5">
          <h3 className="mb-3 font-medium">Draft — edit before sending</h3>
          <label className="mb-1 block text-xs text-[#9aa3b2]">Subject</label>
          <input
            value={out.subject}
            onChange={(e) => setOut({ ...out, subject: e.target.value })}
            className="w-full px-3 py-2 text-sm"
          />
          <label className="mb-1 mt-3 block text-xs text-[#9aa3b2]">Body</label>
          <textarea
            value={out.body}
            onChange={(e) => setOut({ ...out, body: e.target.value })}
            rows={12}
            className="w-full resize-y p-3 text-sm leading-relaxed"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `Subject: ${out.subject}\n\n${out.body}`
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="btn-primary px-5 py-2.5 text-sm"
            >
              {copied ? "Copied ✓" : "Copy email"}
            </button>
            <a
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(
                `Subject: ${out.subject}\n\n${out.body}`
              )}`}
              download="Application_Email.txt"
              className="btn-ghost px-5 py-2.5 text-sm"
            >
              Download .txt
            </a>
          </div>
          <p className="mt-3 text-xs text-[#9aa3b2]">
            Word count: {out.body.split(/\s+/).filter(Boolean).length} — target is
            250–350.
          </p>
        </section>
      )}
    </div>
  );
}
