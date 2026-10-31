// Edito — NVIDIA NIM client (OpenAI-compatible endpoint).

const BASE_URL = "https://integrate.api.nvidia.com/v1";

export const MODELS = {
  primary: "nvidia/nemotron-3.5-super-vl-120b-a12b", // writer: rewrite pass (thinking off)
  alt: "openai/gpt-oss-20b", // automatic fallback writer
  fast: "nvidia/nemotron-3.5-super-vl-120b-a12b", // keyword extraction + scoring
} as const;

export type ModelKey = keyof typeof MODELS;

export function requireApiKey(): string {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error(
      "NVIDIA_API_KEY is not set. Add it to .env.local (see .env.example)."
    );
  }
  return key;
}

export async function nimChat(opts: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  reasoningEffort?: number | string;
  timeoutMs?: number;
  thinkingOff?: boolean;
}): Promise<string> {
  const apiKey = requireApiKey();
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: opts.temperature ?? 0.7,
    top_p: opts.topP ?? 0.95,
    max_tokens: opts.maxTokens ?? 4096,
    stream: false,
  };
  if (opts.jsonMode) body["response_format"] = { type: "json_object" };
  if (opts.reasoningEffort !== undefined)
    body["reasoning_effort"] = opts.reasoningEffort;
  if (opts.thinkingOff)
    body["chat_template_kwargs"] = { enable_thinking: false };

  // NVIDIA endpoints intermittently return 200 with an empty body (observed on
  // gpt-oss-20b) or hold requests in queue for minutes. Retry transport-level
  // flakes up to 2 more times; the timeout budget is shared across attempts.
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 1000) throw lastErr ?? new Error("NIM request timed out");
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), remaining);
    let text: string;
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`NIM API error ${res.status}: ${t.slice(0, 500)}`);
      }
      text = await res.text();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        throw new Error(
          `Model ${opts.model} did not respond within ${(opts.timeoutMs ?? 120_000) / 1000}s (queued or unavailable).`
        );
      }
      lastErr = e as Error;
      continue; // retry transport-level failure
    } finally {
      clearTimeout(timer);
    }
    try {
      const data = JSON.parse(text) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) {
        return content;
      }
      lastErr = new Error(`Empty content from ${opts.model}`);
      continue;
    } catch (e) {
      // 200 with non-JSON / empty body — treat as transport flake
      lastErr =
        (e as Error).name === "SyntaxError"
          ? new Error(`Empty or malformed response from ${opts.model}`)
          : (e as Error);
      continue;
    }
  }
  throw lastErr ?? new Error(`NIM request failed for ${opts.model}`);
}

// Some reasoning models wrap JSON in </think><tool_call>edit<arg_key>newString</arg_key><arg_value>// Common LLM JSON breakage: trailing commas in arrays/objects ("Expected ','
// or ']' after array element"), single-quoted strings, stray trailing text.
export function repairJson(raw: string): string {
  return raw
    // remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, "$1")
    // replace curly quotes
    .replace(/[\u201C\u201D\u2018\u2019]/g, (c) =>
      c === "\u2018" || c === "\u2019" ? "'" : '"'
    )
    // drop marker lines like "```json"
    .replace(/^\s*```[a-z]*\s*/g, "")
    .replace(/\s*```\s*$/g, "");
}

// Some reasoning models wrap JSON in <think> blocks or markdown fences.
export function extractJson(raw: string): unknown {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const think = s.match(/<\/think>\s*([\s\S]*)$/);
  if (think) s = think[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
  return JSON.parse(s);
}
