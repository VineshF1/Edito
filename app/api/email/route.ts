import { NextRequest, NextResponse } from "next/server";
import { BASELINE } from "@/lib/resume-baseline";
import { MODELS, extractJson, nimChat, type ModelKey } from "@/lib/nim";
import { EMAIL_RULES_SYSTEM, emailUserPrompt } from "@/lib/prompts";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { looksLikeUrl, resolveJdText } from "@/lib/jd-source";

export const runtime = "nodejs";
export const maxDuration = 120;

const REFINE_ATTEMPTS = 2;

export async function POST(req: NextRequest) {
  const rl = rateLimit(`email:${clientIp(req)}`, 10);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterS}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } }
    );
  }
  const { type, tone, to, context, jd, model = "primary" } = (await req.json()) as {
    type: string;
    tone: string;
    to?: string;
    context?: string;
    jd?: string;
    model?: ModelKey;
  };
  if (typeof type !== "string" || typeof tone !== "string") {
    return NextResponse.json({ error: "Missing type or tone." }, { status: 400 });
  }
  const cap = (s: string | undefined, n: number) =>
    typeof s === "string" ? s.slice(0, n) : s;

  const purpose =
    type === "application"
      ? "New application email for the described role"
      : type === "reply_hr"
        ? "Reply to a recruiter/HR message about this application"
        : type === "followup"
          ? "Follow-up on an existing application (polite status check)"
          : "General job-application email";

  const writerModel = MODELS[model] ?? MODELS.primary;
  const effort = writerModel.includes("gpt-oss")
    ? "low"
    : undefined;
  const thinkingOff = writerModel.includes("nemotron-3.5-super-vl");
  const toSafe = cap(to, 120);
  const contextSafe = cap(context, 8_000);
  let jdSafe = cap(jd, 20_000);

  // Accept either pasted JD text or a job-page URL in the same field.
  if (jdSafe && looksLikeUrl(jdSafe.trim())) {
    try {
      jdSafe = cap(await resolveJdText(jdSafe), 20_000);
    } catch (err: unknown) {
      const e = err as Error;
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
  }

  try {
    let out: {
      subject: string;
      body: string;
    } | null = null;
    let lastRaw = "";
    for (let attempt = 0; attempt <= REFINE_ATTEMPTS && !out; attempt++) {
      lastRaw = await nimChat({
        model: writerModel,
        system: EMAIL_RULES_SYSTEM,
        user: emailUserPrompt(
          purpose,
          `To: ${toSafe ?? "hiring team"}\n\n${contextSafe ?? ""}`,
          jdSafe ?? "",
          JSON.stringify(BASELINE, null, 2),
          tone
        ),
        temperature: 0.6,
        maxTokens: 2048,
        jsonMode: true,
        reasoningEffort: effort,
        thinkingOff,
      });
      const data = extractJson(lastRaw) as { subject: string; body: string };
      if (data?.subject && data?.body && data.body.length > 200) out = data;
    }
    if (!out) {
      return NextResponse.json(
        { error: "Email generation failed validation after retries." },
        { status: 502 }
      );
    }
    return NextResponse.json({
      subject: out.subject,
      body: out.body,
    });
  } catch (err: unknown) {
    const e = err as Error;
    const msg = e.message || "Unknown error";
    return NextResponse.json(
      {
        error: msg.includes("NVIDIA_API_KEY")
          ? "NVIDIA_API_KEY is not configured. Add it to .env.local and restart the dev server."
          : msg,
      },
      { status: 500 }
    );
  }
}
