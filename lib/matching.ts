// Edito — keyword ↔ resume text matcher. ATS-style: a term matches when all
// of its word tokens appear in the resume text with plural/singular
// tolerance, so e.g. "AI agents" also matches a resume saying "multi-agent
// systems" and "LangChain" matches inside "LangChain-based". Order-free and
// punctuation-insensitive — fairer than raw substring search, and the score
// no longer punishes paraphrases the screening machines would count.

export function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/i)
    .map((t) => t.replace(/^\.+/g, "").replace(/\.+$/g, ""))
    .filter((t) => t.length > 1);
}

function singulars(tok: string): string[] {
  // crude English plural tolerance: agents→agent, queries→query, cats→cat
  const out = [tok];
  if (tok.endsWith("ies")) out.push(`${tok.slice(0, -3)}y`);
  if (tok.endsWith("es")) out.push(tok.slice(0, -2));
  if (tok.endsWith("s") && !tok.endsWith("ss")) out.push(tok.slice(0, -1));
  return out;
}

export class TokenSet {
  private words: Set<string>;
  constructor(text: string) {
    const all: string[] = [];
    for (const t of tokensOf(text)) all.push(...singulars(t));
    this.words = new Set(all);
  }
  hasWord(tok: string): boolean {
    return this.words.has(tok) || singulars(tok).some((s) => this.words.has(s));
  }
}

export function termMatched(term: string, res: TokenSet): boolean {
  const toks = tokensOf(term);
  if (!toks.length) return false;
  return toks.every((t) => res.hasWord(t));
}
