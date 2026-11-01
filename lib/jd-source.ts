// Edito — job description来源: plain text or a URL to a posting page.
// Includes SSRF guards since this runs on a local server that the JD text
// must not be able to himself hijack into internal network requests.

const MAX_TEXT_LENGTH = 60_000; // JD text cap (~60k chars) sent to models
const MAX_FETCH_BYTES = 1_500_000; // 1.5 MB HTML cap
const FETCH_TIMEOUT_MS = 15_000;

export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (/\s/.test(s)) return false; // one line only
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s);
}

// Best-effort role title from a job-post URL slug, used when the model
// doesn't return one. ".../junior-aiml-engineer-28443" → "Junior AI/ML Engineer".
// Returns "" when the slug is too generic to be a title.
const UPPER_TOKENS = new Set([
  "ai", "ml", "aiml", "nlp", "qa", "ui", "ux", "sql", "api", "aws", "llm",
  "rag", "devops", "saas", "sre", "html", "css", "js", "gcp",
]);
export function slugTitleFromUrl(input: string): string {
  const s = (input || "").trim();
  if (!looksLikeUrl(s)) return "";
  try {
    const u = new URL(s);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const cleaned = last
      .replace(/[0-9]{2,}$/, "") // trailing numeric id
      .replace(/[-_]+/g, " ")
      .trim();
    if (
      !cleaned ||
      cleaned.length < 4 ||
      /^(jobs?|careers?|positions?|openings?|vaca.*)$/i.test(cleaned)
    ) {
      return "";
    }
    return cleaned
      .split(" ")
      .filter(Boolean)
      .map((w) => {
        const lw = w.toLowerCase();
        if (lw === "aiml") return "AI/ML";
        if (UPPER_TOKENS.has(lw)) return lw.toUpperCase();
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(" ")
      .slice(0, 60);
  } catch {
    return "";
  }
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "0.0.0.0" || h === "::" || h === "::1" || h === "[::1]") return true;
  // IPv4 private/link-local/reserved ranges
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 224) return true; // multicast+
  }
  // IPv6 private/link-local
  if (h.startsWith("[") && (h.includes("fe80") || h.includes("fc") || h.includes("fd"))) {
    return true;
  }
  return false;
}

export async function fetchJdFromUrl(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("That link is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https links are supported.");
  }
  if (url.username || url.password) {
    throw new Error("Links with embedded credentials are not allowed.");
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error("Internal and local network addresses are blocked for security.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EditoJDParser/1.0; +local)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });
  } catch {
    throw new Error("Could not reach that page. Check the link or paste the JD text instead.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`The page responded with HTTP ${res.status}. Paste the JD text instead.`);
  }
  const ctype = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml|text\/plain/.test(ctype)) {
    throw new Error("That link is not an HTML or text page.");
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_FETCH_BYTES) {
    throw new Error("That page is too large to parse. Paste the JD text instead.");
  }
  const html = new TextDecoder("utf-8").decode(buf);
  const text = htmlToText(html);
  if (text.trim().length < 200) {
    throw new Error(
      "Almost no readable text on that page (it may render the posting with JavaScript). Paste the JD text instead."
    );
  }
  return text.slice(0, MAX_TEXT_LENGTH);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

// Normalize whatever the user pasted into clean JD text.
export async function resolveJdText(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("The job description is empty.");
  if (looksLikeUrl(trimmed)) {
    return fetchJdFromUrl(trimmed);
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return trimmed.slice(0, MAX_TEXT_LENGTH);
  }
  return trimmed;
}
