/**
 * Reduce mammoth's simple HTML (h1–h6, p, li, table, inline tags) to citeable
 * sections of plain text. The HTML never reaches a browser — this only exists
 * to recover the document's headings so answers can cite "§ Article IV".
 */
import type { TextUnit } from "./types";

const SECTION_MAX_CHARS = 6_000;
const PART_CHARS = 3_000;

type Block = { heading: number | null; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function toBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  let buf = "";
  let heading: number | null = null;
  let cellInRow = 0;
  let tableDepth = 0;
  const flush = () => {
    const text = decodeEntities(buf).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
    if (text) blocks.push({ heading, text });
    buf = "";
    heading = null;
  };
  const re = /<(\/?)([a-zA-Z0-9]+)[^>]*>|([^<]+)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[3] !== undefined) { buf += m[3]; continue; }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const h = /^h([1-6])$/.exec(tag);
    if (h) {
      if (!closing) { flush(); heading = Number(h[1]); } else flush();
    } else if (tag === "p" || tag === "li") {
      // Inside a table a cell's paragraphs stay on the row; the row ends at </tr>.
      if (tableDepth > 0) { if (closing) buf += " "; }
      else if (closing) flush();
      else if (tag === "li") buf += "• ";
    } else if (tag === "br") {
      buf += "\n";
    } else if (tag === "tr") {
      if (closing) { buf += "\n"; cellInRow = 0; }
    } else if (tag === "td" || tag === "th") {
      if (!closing) { if (cellInRow > 0) buf += " | "; cellInRow++; }
    } else if (tag === "table") {
      if (closing) { tableDepth = Math.max(0, tableDepth - 1); if (tableDepth === 0) flush(); }
      else { if (tableDepth === 0) flush(); tableDepth++; }
    }
  }
  flush();
  return blocks;
}

/** Split text into pieces of at most `max` chars, preferring line breaks. */
export function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Sections split at the document's top two heading levels; deeper headings
 * stay inline. A document with no headings becomes ~3,000-char "Part n" blocks.
 */
export function htmlToSections(html: string): TextUnit[] {
  const blocks = toBlocks(html);
  const levels = blocks.filter(b => b.heading !== null).map(b => b.heading!);
  const units: TextUnit[] = [];
  const push = (label: string, text: string) => {
    const pieces = splitText(text, SECTION_MAX_CHARS).filter(Boolean);
    pieces.forEach((piece, i) => {
      units.push({ ref: `s${units.length + 1}`, label: i === 0 ? label : `${label} (cont.)`, text: piece });
    });
  };

  if (levels.length === 0) {
    const all = blocks.map(b => b.text).join("\n\n");
    if (!all.trim()) return units;
    splitText(all, PART_CHARS).forEach((piece, i) => units.push({ ref: `s${i + 1}`, label: `Part ${i + 1}`, text: piece }));
    return units;
  }

  const splitAt = Math.min(...levels) + 1;
  let label = "Start";
  let lines: string[] = [];
  for (const b of blocks) {
    if (b.heading !== null && b.heading <= splitAt) {
      if (lines.length) push(label, lines.join("\n"));
      label = b.text.replace(/\s+/g, " ").slice(0, 80);
      lines = [b.text];
    } else {
      lines.push(b.text);
    }
  }
  if (lines.length) push(label, lines.join("\n"));
  return units;
}
