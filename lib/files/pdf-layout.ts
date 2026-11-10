/**
 * Rebuild a PDF page's visible structure from pdf.js text items. Pure.
 *
 * pdf.js hands back positioned runs of text, and fills the space between two
 * table cells with a synthetic " " item, so joining `str`s flattens a table row
 * to "Formal venue Social $1,200.50" and the columns are gone. Here runs are
 * grouped into lines by baseline, split into cells wherever a horizontal gap
 * is wider than a word space, and consecutive multi-cell lines become a table
 * whose columns are lined up by horizontal overlap — so an empty cell stays
 * empty instead of shifting the next value into the wrong column.
 *
 * Output uses the same light markdown the other extractors emit:
 *   "# " / "## "  a line set noticeably larger than the body text
 *   "### "        a short ALL-CAPS line at body size ("ARTICLE IV — DUES")
 *   "| a | b |"   a table row; "| --- |" follows a text-only first row, and
 *                 an empty cell reads "(blank)" (a bare "|  |" is easy to skip)
 *   blank line    a paragraph break (a vertical gap well over a line)
 */

import { BLANK_CELL } from "./units";

export interface PdfItem { str: string; x: number; y: number; w: number; size: number }

interface Cell { text: string; x0: number; x1: number }
export interface PdfLine { cells: Cell[]; y: number; size: number }

/**
 * A horizontal gap wider than this many ems starts a new cell. A word space is
 * ~0.25em (justified text stretches it to ~0.6em); table gutters run from ~0.8em.
 */
const CELL_GAP_EM = 0.8;
/** A gap wider than this (with no space on either side) is a word break. */
const WORD_GAP_EM = 0.15;
/** A drop between baselines larger than this many line heights is a paragraph break. */
const PARA_GAP = 1.6;

/** Group items into lines (in stream order, so a two-column page stays column by column) and cells. */
export function itemsToLines(items: PdfItem[]): PdfLine[] {
  const groups: PdfItem[][] = [];
  let cur: PdfItem[] = [];
  let curY = 0;
  for (const it of items) {
    // Whitespace-only runs are pdf.js's gap fillers: the gap itself is measured from positions.
    if (!it.str.trim()) continue;
    if (cur.length && Math.abs(it.y - curY) > Math.max(1.5, it.size * 0.5)) { groups.push(cur); cur = []; }
    if (!cur.length) curY = it.y;
    cur.push(it);
  }
  if (cur.length) groups.push(cur);

  return groups.map(g => {
    const sorted = [...g].sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    let size = 0, longest = -1;
    for (const it of sorted) {
      if (it.str.length > longest) { longest = it.str.length; size = it.size; }
      const last = cells[cells.length - 1];
      const gap = last ? it.x - last.x1 : Infinity;
      if (!last || gap > CELL_GAP_EM * it.size) {
        cells.push({ text: it.str, x0: it.x, x1: it.x + it.w });
        continue;
      }
      // A run that starts inside the previous one is separate text, not the rest of a word.
      const joinSpace = (gap > WORD_GAP_EM * it.size || gap < -WORD_GAP_EM * it.size) && !/\s$/.test(last.text) && !/^\s/.test(it.str);
      last.text += (joinSpace ? " " : "") + it.str;
      last.x1 = Math.max(last.x1, it.x + it.w);
    }
    for (const c of cells) c.text = c.text.replace(/\s+/g, " ").trim();
    return { cells: cells.filter(c => c.text), y: g[0].y, size };
  }).filter(l => l.cells.length > 0);
}

/** The body text size: the size carrying the most characters. */
export function bodySize(lines: PdfLine[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    const key = Math.round(l.size * 2) / 2;
    weight.set(key, (weight.get(key) ?? 0) + l.cells.reduce((n, c) => n + c.text.length, 0));
  }
  let best = 0, bestW = -1;
  for (const [s, w] of weight) if (w > bestW) { best = s; bestW = w; }
  return best || 11;
}

const isNumeric = (s: string) => /^[-+($]*[\d.,]+%?\)?$/.test(s.replace(/\s/g, "")) && /\d/.test(s);

/**
 * Assign each cell of a table block to a column; returns rows of strings.
 * Columns start as runs of horizontally overlapping cells. Two neighbouring
 * runs that never both hold a cell in the same row are one column whose cells
 * are aligned differently — a left-aligned "Amount" header over right-aligned
 * figures — and are merged. (Two columns that each row fills only one of, like
 * Debit / Credit, stay apart because their header row fills both.)
 */
function alignColumns(block: PdfLine[]): string[][] {
  const spans: { x0: number; x1: number }[] = [];
  for (const c of block.flatMap(l => l.cells).sort((a, b) => a.x0 - b.x0)) {
    const last = spans[spans.length - 1];
    if (last && c.x0 <= last.x1) last.x1 = Math.max(last.x1, c.x1);
    else spans.push({ x0: c.x0, x1: c.x1 });
  }
  const spanOf = (c: Cell, list: { x0: number; x1: number }[]) => {
    const k = list.findIndex(s => c.x0 <= s.x1 && c.x1 >= s.x0);
    return k < 0 ? list.length - 1 : k;
  };
  for (let k = 0; k + 1 < spans.length;) {
    const both = block.some(l => {
      const at = new Set(l.cells.map(c => spanOf(c, spans)));
      return at.has(k) && at.has(k + 1);
    });
    if (both) { k++; continue; }
    spans.splice(k, 2, { x0: spans[k].x0, x1: Math.max(spans[k].x1, spans[k + 1].x1) });
  }
  return block.map(l => {
    const row: string[] = spans.map(() => "");
    for (const c of l.cells) {
      const at = spanOf(c, spans);
      row[at] = row[at] ? `${row[at]} ${c.text}` : c.text;
    }
    return row;
  });
}

const tableRow = (cells: string[]) => `| ${cells.map(c => c.replace(/\|/g, "/")).join(" | ")} |`;

function headingMark(l: PdfLine, body: number): string {
  if (l.cells.length !== 1) return "";
  const text = l.cells[0].text;
  if (text.length > 120) return "";
  if (l.size >= body * 1.45) return "# ";
  if (l.size >= body * 1.15) return "## ";
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 8 && text.length <= 80 && /\s/.test(text) && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return "### ";
  return "";
}

/** One page's lines as text, with headings, tables and paragraph breaks marked. */
export function renderLines(lines: PdfLine[], body: number): string {
  const out: string[] = [];
  let i = 0;
  let prev: PdfLine | null = null;
  while (i < lines.length) {
    const l = lines[i];
    if (prev && prev.y - l.y > PARA_GAP * Math.min(prev.size, l.size) && out.length && out[out.length - 1] !== "") out.push("");
    if (l.cells.length > 1) {
      let j = i;
      while (j < lines.length && lines[j].cells.length > 1) j++;
      if (j - i >= 2) {
        const rows = alignColumns(lines.slice(i, j));
        rows.forEach((r, k) => {
          out.push(tableRow(r.map(c => c || BLANK_CELL)));
          if (k === 0 && r.every(c => !c || !isNumeric(c))) out.push(tableRow(r.map(() => "---")));
        });
        prev = lines[j - 1];
        i = j;
        continue;
      }
      out.push(l.cells.map(c => c.text).join(" | "));
    } else {
      out.push(headingMark(l, body) + l.cells[0].text);
    }
    prev = l;
    i++;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
