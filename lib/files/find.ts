/**
 * Scan whole extracted files for one kind of fact — every amount, date,
 * percentage, email, phone number, name, or an exact piece of text — for
 * find_in_attachments. Pure.
 *
 * Keyword search can't do this: "$" and "3/14" aren't words, so a request like
 * "every dollar amount in the handbook" used to mean reading the file page by
 * page until the tool loop ran out of rounds. A scan covers the whole file in
 * one call and returns each hit with where it is and the line around it.
 */
import type { AttachmentContent, Cell, SheetData, TextUnit } from "./types";
import { colLetter, dateValue, formatRange, isoDate, numericValue } from "./cells";

export const FIND_KINDS = ["amounts", "dates", "percentages", "emails", "phones", "names", "text"] as const;
export type FindKind = (typeof FIND_KINDS)[number];

export interface Hit {
  /** Unit ref ("p7", "s2") or sheet cell ("sh1!C5"). */
  ref: string;
  /** The match as written. */
  value: string;
  /** For ordering by value: an amount or percentage as a number, a date as ms. */
  sortKey: number | null;
  /** The ISO date, when the match is a full date. */
  iso?: string;
  /** The amount as a number. */
  number?: number;
  /** The line (or row) the match sits in. */
  context: string;
  /** For a match in a table row: the table's header row. */
  columns?: string;
  /** Position in the file, for document order. */
  order: number;
}

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY = "(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*,?\\s+";

const PATTERNS: Record<Exclude<FindKind, "text" | "names">, RegExp> = {
  // $1,200.50 · -$3 · ($45.00) · $2.5k · $3 million · USD 120 · 120 dollars
  amounts: /\(\s?\$\s?\d[\d,]*(?:\.\d+)?\s?\)|[-−]?\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|million|thousand)\b)?|\b(?:usd|us\$)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|usd)\b/gi,
  // 2026-03-14 · 3/14/2026 · 3/14 · March 14, 2026 · Mon, Mar 14 · 14 March 2026
  dates: new RegExp(
    `\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?\\b|\\b(?:${WEEKDAY})?${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\.?(?:,?\\s+\\d{4})?\\b`,
    "gi",
  ),
  percentages: /\b\d+(?:\.\d+)?\s?(?:%|percent\b)/gi,
  emails: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g,
  // (555) 123-4567 · 555-123-4567 · 555.123.4567 · +1 555 123 4567
  phones: /(?:\+1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g,
};

// Two to four capitalized words: "Rob Chen", "Nathaniel Baccaray", "Alpha Beta Chapter".
const NAME_RE = /\b[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?(?:\s+(?:[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?|[A-Z]\.|de|De|La|Le|van|Van|von|Von|O'[A-Z][a-z]+)){1,3}\b/g;
const NAME_NOISE = new Set([
  "the", "a", "an", "in", "on", "at", "for", "and", "of", "to", "this", "that", "each", "every", "our", "any", "all", "if", "when", "per",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "article", "section", "page", "part", "chapter", "item", "total", "note", "notes", "spring", "fall", "summer", "winter",
]);

/** Words that never end a name ("Rob Chen March 3" is Rob Chen); "Chapter" or "Section" can ("Alpha Beta Chapter"). */
const TRAILING_NOISE = new Set([...NAME_NOISE].filter(w => !["article", "section", "page", "part", "chapter", "item", "total", "note", "notes"].includes(w)));

/** A name match with leading noise words ("The", "Article") stripped; null when fewer than two words remain. */
function cleanName(raw: string): string | null {
  const words = raw.split(/\s+/);
  while (words.length && NAME_NOISE.has(words[0].toLowerCase())) words.shift();
  while (words.length && TRAILING_NOISE.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.length >= 2 ? words.join(" ") : null;
}

function amountValue(raw: string): number | null {
  let s = raw.toLowerCase().replace(/usd|us\$|dollars|[\s$,]/g, "");
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) { neg = true; s = s.slice(1, -1); }
  if (/^[-−]/.test(s)) { neg = true; s = s.slice(1); }
  let mult = 1;
  const m = /(k|m|million|thousand)$/.exec(s);
  if (m) { mult = m[1] === "k" || m[1] === "thousand" ? 1_000 : 1_000_000; s = s.slice(0, -m[1].length); }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) * mult : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A date match as ISO when it carries a year; month/day-only dates get a sort key within an arbitrary year. */
function dateInfo(raw: string): { iso?: string; sortKey: number | null } {
  const s = raw.replace(new RegExp(`^${WEEKDAY}`, "i"), "").replace(/(\d)(st|nd|rd|th)/i, "$1").replace(/\bof\s+/i, "").trim();
  const full = dateValue(s) ?? dateValue(s.replace(/,/g, "").replace(/(\D)\s+(\d{4})$/, "$1, $2"));
  if (full !== null) return { iso: isoDate(full), sortKey: full };
  let m = /^(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return { sortKey: Date.UTC(2000, +m[1] - 1, +m[2]) };
  m = /^([a-z]+)\.?\s+(\d{1,2})$/i.exec(s);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return { sortKey: Date.UTC(2000, MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), +m[2]) };
  m = /^(\d{1,2})\s+([a-z]+)\.?$/i.exec(s);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return { sortKey: Date.UTC(2000, MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1]) };
  return { sortKey: null };
}

const CONTEXT_CHARS = 200;

/** The line, or a window of it around the match when the line is long. */
function contextOf(line: string, index: number, length: number): string {
  if (line.length <= CONTEXT_CHARS) return line.trim();
  const start = Math.max(0, index - 80);
  const end = Math.min(line.length, index + length + 80);
  return `${start > 0 ? "…" : ""}${line.slice(start, end).trim()}${end < line.length ? "…" : ""}`;
}

const SEPARATOR_RE = /^\|[\s:|-]+\|$/;

function matchesIn(kind: FindKind, line: string, text: string | undefined): { value: string; index: number }[] {
  if (kind === "text") {
    if (!text) return [];
    const out: { value: string; index: number }[] = [];
    const lower = line.toLowerCase(), want = text.toLowerCase();
    for (let i = lower.indexOf(want); i >= 0; i = lower.indexOf(want, i + Math.max(1, want.length))) out.push({ value: line.slice(i, i + want.length), index: i });
    return out;
  }
  const re = kind === "names" ? NAME_RE : PATTERNS[kind];
  return [...line.matchAll(new RegExp(re.source, re.flags))].map(m => ({ value: m[0], index: m.index ?? 0 }));
}

function describe(kind: FindKind, value: string): Pick<Hit, "sortKey" | "iso" | "number"> | null {
  switch (kind) {
    case "amounts": { const n = amountValue(value); return n === null ? null : { sortKey: n, number: n }; }
    case "percentages": { const n = parseFloat(value); return Number.isFinite(n) ? { sortKey: n, number: n } : null; }
    case "dates": {
      const d = dateInfo(value);
      // "3/14" with no slash-year is a date; "4/5" in "won 4/5 votes" isn't worth excluding.
      return { sortKey: d.sortKey, ...(d.iso ? { iso: d.iso } : {}) };
    }
    default: return { sortKey: null };
  }
}

export function findInUnits(units: TextUnit[], kind: FindKind, text?: string): Hit[] {
  const hits: Hit[] = [];
  let order = 0;
  for (const u of units) {
    const lines = u.text.split("\n");
    let header: string | undefined;
    lines.forEach((line, i) => {
      if (line.startsWith("|")) {
        if (SEPARATOR_RE.test(lines[i + 1] ?? "") && !SEPARATOR_RE.test(line)) header = line;
        if (SEPARATOR_RE.test(line)) return;
      } else {
        header = undefined;
      }
      for (const m of matchesIn(kind, line, text)) {
        const value = kind === "names" ? cleanName(m.value) : m.value.trim();
        if (!value) continue;
        const info = describe(kind, value);
        if (!info) continue;
        const inRow = line.startsWith("|") && header && header !== line;
        hits.push({ ref: u.ref, value, ...info, context: contextOf(line, m.index, m.value.length), ...(inRow ? { columns: header } : {}), order: order++ });
      }
    });
  }
  return hits;
}

const MONEY_HEADER = /amount|cost|price|total|dues|balance|paid|owed|owe|fee|budget|spent|revenue|income|expense|deposit|\$/i;
const NAME_HEADER = /\bname\b|member|brother|person|owner|who|contact/i;

function rowText(sheet: SheetData, row: Cell[]): string {
  const text = sheet.headerRow === null
    ? row.map(c => (c === null ? "" : String(c))).join(" | ")
    : row.map((c, k) => (c === null ? null : `${sheet.columns[k]}: ${c}`)).filter(Boolean).join("; ");
  return text.length > CONTEXT_CHARS ? `${text.slice(0, CONTEXT_CHARS)}…` : text;
}

/**
 * Spreadsheet cells of the kind. Typed cells answer directly: a number in a
 * money column is an amount, a date cell is a date, a cell in a name column is
 * a name. Text cells are scanned like document lines.
 */
export function findInSheets(sheets: SheetData[], kind: FindKind, text?: string): Hit[] {
  const hits: Hit[] = [];
  let order = 0;
  for (const sheet of sheets) {
    const first = sheet.headerRow === null ? 0 : sheet.headerRow + 1;
    for (let r = first; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      row.forEach((cell, c) => {
        if (cell === null) return;
        const ref = `${sheet.ref}!${formatRange({ c0: c, r0: r, c1: c, r1: r })}`;
        const header = sheet.columns[c] ?? colLetter(c);
        const push = (value: string, info: Pick<Hit, "sortKey" | "iso" | "number">) =>
          hits.push({ ref, value, ...info, context: `${sheet.name} row ${r + 1}: ${rowText(sheet, row)}`, order: order++ });

        if (kind === "amounts" && typeof cell === "number" && MONEY_HEADER.test(header)) { push(String(cell), { sortKey: cell, number: cell }); return; }
        if (kind === "dates") {
          const d = dateValue(cell);
          if (d !== null) { push(String(cell), { sortKey: d, iso: isoDate(d) }); return; }
        }
        if (kind === "names" && typeof cell === "string" && NAME_HEADER.test(header) && numericValue(cell) === null) { push(cell.trim(), { sortKey: null }); return; }
        if (typeof cell !== "string") return;
        for (const m of matchesIn(kind, cell, text)) {
          const value = kind === "names" ? cleanName(m.value) : m.value.trim();
          if (!value) continue;
          const info = describe(kind, value);
          if (info) push(value, info);
        }
      });
    }
  }
  return hits;
}

export function findInContent(content: AttachmentContent, kind: FindKind, text?: string): Hit[] {
  const hits = content.type === "text" ? findInUnits(content.units, kind, text) : findInSheets(content.sheets, kind, text);
  if (kind === "dates") placeYearless(hits);
  return hits;
}

/**
 * "Mar 14" with no year sorts in the year the file's full dates mostly use, so
 * a timeline doesn't put every yearless date before every dated one.
 */
function placeYearless(hits: Hit[]): void {
  const years = new Map<number, number>();
  for (const h of hits) if (h.iso) { const y = Number(h.iso.slice(0, 4)); years.set(y, (years.get(y) ?? 0) + 1); }
  if (years.size === 0) return;
  const year = [...years.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  for (const h of hits) {
    if (h.iso || h.sortKey === null) continue;
    const d = new Date(h.sortKey);
    h.sortKey = Date.UTC(year, d.getUTCMonth(), d.getUTCDate());
  }
}
