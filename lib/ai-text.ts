/**
 * Keyword search helpers shared by the read tools that excerpt long text
 * (search_meeting_notes, and the Ask Chapt file tools). Pure.
 */

const NOTES_STOPWORDS = new Set(["the", "and", "for", "about", "what", "did", "was", "were", "with", "that", "this", "our", "who", "when", "meeting", "meetings", "minutes", "notes", "chapter"]);

export function noteTerms(query: string): string[] {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}$]+/u).filter(w => w.length >= 2 && !NOTES_STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 6);
}

/**
 * The lines of `text` that mention a term, each with the line before and
 * after and the heading it sits under, joined in document order with "…"
 * marking the gaps. Clipped to `budget` characters.
 */
export function noteExcerpts(text: string, terms: string[], budget: number): string {
  const lines = text.split("\n");
  const keep = new Set<number>();
  let heading = -1;
  lines.forEach((line, i) => {
    if (/^\s*#{1,3}/.test(line)) heading = i;
    const lower = line.toLowerCase();
    if (!terms.some(t => lower.includes(t))) return;
    if (heading >= 0) keep.add(heading);
    for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) keep.add(j);
  });
  let out = "";
  let prev = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    const piece = (prev >= 0 && i > prev + 1 ? "…\n" : "") + lines[i] + "\n";
    if (out.length + piece.length > budget) { out += "…"; break; }
    out += piece;
    prev = i;
  }
  return out.trimEnd();
}
