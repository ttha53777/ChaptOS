/**
 * Spreadsheet cell helpers: number parsing for text cells (CSV), header
 * detection, and A1 addressing. Pure.
 */
import type { Cell, SheetData } from "./types";

const NUMBER_RE = /^[-+]?\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$/;

/**
 * "1,234.50", "$1,234.50", "(45.00)" (negative), "-$3", "12%" (→ 0.12, the
 * value a spreadsheet stores for a percent cell). Anything else → null.
 */
export function parseNumber(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) { negative = true; s = s.slice(1, -1).trim(); }
  let percent = false;
  if (s.endsWith("%")) { percent = true; s = s.slice(0, -1).trim(); }
  if (s.startsWith("-$") || s.startsWith("$-")) { negative = !negative; s = s.slice(2); }
  if (!NUMBER_RE.test(s) || !/\d/.test(s)) return null;
  const n = Number(s.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  const v = (negative ? -n : n) * (percent ? 0.01 : 1);
  return percent ? Number(v.toFixed(12)) : v;
}

/** A CSV cell: number when it reads as one, null when blank, else the trimmed string. */
export function typeCell(raw: string): Cell {
  const s = raw.trim();
  if (!s) return null;
  const n = parseNumber(s);
  return n === null ? s : n;
}

/** Number value of a cell for arithmetic, or null when it isn't one. */
export function numericValue(c: Cell): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  if (typeof c === "string") return parseNumber(c);
  return null;
}

function isTextCell(c: Cell): boolean {
  return typeof c === "string" && parseNumber(c) === null;
}

/**
 * 0-based index of the header row: the first of the top 10 rows where at least
 * half the non-empty cells are non-numeric text and the next row has a number.
 * Failing that (an all-text sheet: a roster, a sign-up list), the first row of
 * short, distinct labels filling most columns, none of which recurs below it
 * in its own column — "Role" heads a column; "Treasurer" repeats down one.
 */
export function detectHeaderRow(rows: Cell[][]): number | null {
  for (let i = 0; i < Math.min(10, rows.length - 1); i++) {
    const filled = rows[i].filter(c => c !== null && c !== "");
    if (filled.length === 0) continue;
    const text = filled.filter(isTextCell).length;
    if (text * 2 < filled.length) continue;
    if (rows[i + 1].some(c => numericValue(c) !== null)) return i;
  }
  return detectTextHeaderRow(rows);
}

function detectTextHeaderRow(rows: Cell[][]): number | null {
  const width = rows[0]?.length ?? 0;
  if (width < 2) return null;
  for (let i = 0; i < Math.min(10, rows.length - 1); i++) {
    const row = rows[i];
    const filled = row.filter(c => c !== null && c !== "");
    if (filled.length === 0) continue;
    // The first non-empty row decides: a title row ("Spring roster") is skipped only when it is one cell.
    if (filled.length === 1) continue;
    if (filled.length * 2 < width || !filled.every(c => isTextCell(c) && String(c).length <= 40)) return null;
    const labels = filled.map(c => String(c).trim().toLowerCase());
    if (new Set(labels).size !== labels.length) return null;
    const below = rows.slice(i + 1);
    const recurs = row.some((c, k) => c !== null && below.some(r => r[k] !== null && String(r[k]).trim().toLowerCase() === String(c).trim().toLowerCase()));
    return recurs ? null : i;
  }
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function utc(y: number, m: number, d: number): number | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  return new Date(t).getUTCDate() === d ? t : null;
}

/**
 * A cell as a calendar date (UTC midnight, ms), or null. Reads ISO dates (what
 * xlsx date cells become), US "3/14/2026" and "March 14, 2026" / "14 Mar 2026".
 * Numbers are never dates here: a bare 46095 is a number.
 */
export function dateValue(c: Cell): number | null {
  if (typeof c !== "string") return null;
  const s = c.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?$/.exec(s);
  if (m) return utc(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) return utc(+m[3], +m[1], +m[2]);
  m = /^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/i.exec(s);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return utc(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
  m = /^(\d{1,2}) ([a-z]{3,9})\.?,? (\d{4})$/i.exec(s);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return utc(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
  return null;
}

/** A date value back as "YYYY-MM-DD". */
export const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "A" → 0, "AB" → 27. */
export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 0-based, inclusive. */
export interface CellRange { c0: number; r0: number; c1: number; r1: number }

/** "B2:D9" or "B2" → a range; null when it isn't A1 notation. */
export function parseRange(a1: string): CellRange | null {
  const m = /^([A-Z]{1,3})(\d{1,7})(?::([A-Z]{1,3})(\d{1,7}))?$/.exec(a1.trim().toUpperCase());
  if (!m) return null;
  const c0 = colIndex(m[1]), r0 = Number(m[2]) - 1;
  const c1 = m[3] ? colIndex(m[3]) : c0, r1 = m[4] ? Number(m[4]) - 1 : r0;
  if (r0 < 0 || r1 < 0) return null;
  return { c0: Math.min(c0, c1), r0: Math.min(r0, r1), c1: Math.max(c0, c1), r1: Math.max(r0, r1) };
}

export function formatRange(r: CellRange): string {
  const a = `${colLetter(r.c0)}${r.r0 + 1}`;
  const b = `${colLetter(r.c1)}${r.r1 + 1}`;
  return a === b ? a : `${a}:${b}`;
}

/** Header labels for a sheet: the header row's text, or the column letter where it's blank. */
export function columnLabels(rows: Cell[][], headerRow: number | null, colCount: number): string[] {
  return Array.from({ length: colCount }, (_, i) => {
    const h = headerRow === null ? null : rows[headerRow]?.[i];
    const label = h === null || h === undefined ? "" : String(h).trim().slice(0, 60);
    return label || colLetter(i);
  });
}

const blank = (c: Cell | undefined) => c === null || c === undefined || c === "";

/**
 * Normalize raw rows into a SheetData: drop trailing blank rows and columns,
 * pad ragged rows, and stop at `cellBudget` cells. `truncated` says rows were cut.
 */
export function buildSheet(ref: string, name: string, raw: Cell[][], cellBudget: number): { sheet: SheetData; cells: number; truncated: boolean } {
  let lastRow = raw.length - 1;
  while (lastRow >= 0 && raw[lastRow].every(blank)) lastRow--;
  let colCount = 0;
  for (let r = 0; r <= lastRow; r++) {
    for (let c = raw[r].length - 1; c >= colCount; c--) {
      if (!blank(raw[r][c])) { colCount = c + 1; break; }
    }
  }
  const maxRows = colCount === 0 ? 0 : Math.max(0, Math.floor(cellBudget / colCount));
  const take = Math.min(lastRow + 1, maxRows);
  const rows: Cell[][] = [];
  for (let r = 0; r < take; r++) {
    rows.push(Array.from({ length: colCount }, (_, c) => (blank(raw[r][c]) ? null : raw[r][c] ?? null)));
  }
  const headerRow = detectHeaderRow(rows);
  return {
    sheet: { ref, name, rowCount: rows.length, colCount, headerRow, columns: columnLabels(rows, headerRow, colCount), rows },
    cells: rows.length * colCount,
    truncated: take < lastRow + 1,
  };
}

/** Rough text size of a sheet, for the org storage ceiling. */
export function sheetChars(s: SheetData): number {
  let n = 0;
  for (const row of s.rows) for (const c of row) n += c === null ? 1 : String(c).length + 1;
  return n;
}
