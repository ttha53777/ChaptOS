/**
 * Reduce mammoth's simple HTML (h1–h6, p, li, table, inline tags) to citeable
 * sections of plain text. The HTML never reaches a browser — this only exists
 * to recover the document's headings so answers can cite "§ Article IV".
 */
import type { TextUnit } from "./types";
import { BLANK_CELL, carryTableHeaders } from "./units";

const SECTION_MAX_CHARS = 6_000;
const PART_CHARS = 3_000;

type Block = { heading: number | null; text: string };

/** A block as it sits in a section: headings keep their level as "#"s. */
const marked = (b: Block) => (b.heading === null ? b.text : `${"#".repeat(b.heading)} ${b.text.replace(/\s+/g, " ")}`);

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

const attr = (tag: string, name: string) => {
  const m = new RegExp(`${name}="(\\d+)"`, "i").exec(tag);
  return m ? Math.min(50, Math.max(1, Number(m[1]))) : 1;
};

/** A table as markdown rows: header, separator, body. Pipes inside cells become slashes. */
function renderTable(rows: string[][]): string {
  const width = Math.max(...rows.map(r => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => (r[i] ?? "").replace(/\|/g, "/")).join(" | ")} |`;
  const out = rows.map(line);
  if (rows.length > 1) out.splice(1, 0, line(Array.from({ length: width }, () => "---")));
  return out.join("\n");
}

function toBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  let buf = "";
  let heading: number | null = null;
  let indent = "";
  const lists: { ordered: boolean; n: number }[] = [];
  const flush = () => {
    const text = decodeEntities(buf).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
    if (text) blocks.push({ heading, text: indent + text });
    buf = "";
    heading = null;
    indent = "";
  };

  // Table state. Only the outermost table is laid out as rows; a nested table's
  // cells fold into the enclosing cell as "a / b; c / d".
  let tableDepth = 0;
  let rows: string[][] = [];
  let row: string[] | null = null;
  let cell: string | null = null;
  let cellSpan = { col: 1, row: 1 };
  let carry = new Map<number, { text: string; left: number }>();
  const placeCarried = () => {
    if (!row) return;
    for (let c = carry.get(row.length); c; c = carry.get(row.length)) {
      row.push(c.text);
      if (--c.left === 0) carry.delete(row.length - 1);
    }
  };

  const re = /<(\/?)([a-zA-Z0-9]+)[^>]*>|([^<]+)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[3] !== undefined) {
      if (cell !== null) cell += m[3];
      else if (tableDepth === 0) buf += m[3];
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const h = /^h([1-6])$/.exec(tag);

    if (tag === "table") {
      if (!closing) {
        if (tableDepth === 0) { flush(); rows = []; carry = new Map(); }
        else if (cell !== null) cell += " ";
        tableDepth++;
      } else if (tableDepth > 0) {
        tableDepth--;
        if (tableDepth === 0) {
          const kept = rows.filter(r => r.some(c => c && c !== BLANK_CELL));
          if (kept.length) blocks.push({ heading: null, text: renderTable(kept) });
          rows = []; row = null; cell = null;
        }
      }
      continue;
    }
    if (tableDepth > 0) {
      const outer = tableDepth === 1;
      if (tag === "tr") {
        if (!outer) { if (closing && cell !== null) cell += "; "; continue; }
        if (!closing) { row = []; placeCarried(); }
        else if (row) { placeCarried(); rows.push(row); row = null; }
      } else if (tag === "td" || tag === "th") {
        if (!outer) { if (!closing && cell !== null) cell += " / "; continue; }
        if (!closing) { cell = ""; cellSpan = { col: attr(m[0], "colspan"), row: attr(m[0], "rowspan") }; }
        else if (cell !== null && row) {
          const text = decodeEntities(cell).replace(/\s+/g, " ").trim();
          // A merged-down cell repeats in the rows it covers, so each row reads whole.
          if (cellSpan.row > 1) carry.set(row.length, { text, left: cellSpan.row - 1 });
          row.push(text || BLANK_CELL);
          // A merged-across cell's extra columns stay empty: they aren't blank, they're the same cell.
          for (let k = 1; k < cellSpan.col; k++) row.push("");
          cell = null;
          placeCarried();
        }
      } else if ((tag === "p" || tag === "li" || tag === "br") && cell !== null) {
        if (closing || tag === "br") cell += " ";
      }
      continue;
    }

    if (h) {
      if (!closing) { flush(); heading = Number(h[1]); } else flush();
    } else if (tag === "ol" || tag === "ul") {
      if (!closing) { if (buf.trim()) flush(); lists.push({ ordered: tag === "ol", n: 0 }); }
      else lists.pop();
    } else if (tag === "li") {
      if (closing) flush();
      else {
        // A nested list opens inside its parent item: the parent's own text is a block of its own.
        if (buf.trim()) flush();
        const list = lists[lists.length - 1];
        indent = "  ".repeat(Math.max(0, lists.length - 1)) + (list?.ordered ? `${++list.n}. ` : "• ");
      }
    } else if (tag === "p") {
      if (closing) flush();
    } else if (tag === "br") {
      buf += "\n";
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
    const pieces = carryTableHeaders(splitText(text, SECTION_MAX_CHARS).filter(Boolean));
    pieces.forEach((piece, i) => {
      units.push({ ref: `s${units.length + 1}`, label: i === 0 ? label : `${label} (cont.)`, text: piece });
    });
  };

  if (levels.length === 0) {
    const all = blocks.map(b => b.text).join("\n\n");
    if (!all.trim()) return units;
    carryTableHeaders(splitText(all, PART_CHARS)).forEach((piece, i) => units.push({ ref: `s${i + 1}`, label: `Part ${i + 1}`, text: piece }));
    return units;
  }

  const splitAt = Math.min(...levels) + 1;
  let label = "Start";
  let lines: string[] = [];
  for (const b of blocks) {
    if (b.heading !== null && b.heading <= splitAt) {
      if (lines.length) push(label, lines.join("\n"));
      label = b.text.replace(/\s+/g, " ").slice(0, 80);
      lines = [marked(b)];
    } else {
      lines.push(marked(b));
    }
  }
  if (lines.length) push(label, lines.join("\n"));
  return units;
}
