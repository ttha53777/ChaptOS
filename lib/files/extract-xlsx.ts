import readXlsxFile from "read-excel-file/node";
import { FileRejected, type Cell, type Extracted, type SheetData } from "./types";
import { CELLS_MAX, SHEETS_MAX } from "./limits";
import { buildSheet, sheetChars } from "./cells";

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim();
  return s || null;
}

/**
 * Every sheet as a typed grid. Formulas are never evaluated: the workbook's
 * cached values are what we read. Caller has already run preflightZip.
 */
export async function extractXlsx(bytes: Buffer): Promise<Extracted> {
  let book: Awaited<ReturnType<typeof readXlsxFile>>;
  try {
    book = await readXlsxFile(bytes);
  } catch {
    throw new FileRejected("MALFORMED");
  }
  const sheets: SheetData[] = [];
  let budget = CELLS_MAX;
  let truncated = book.length > SHEETS_MAX;
  for (const s of book.slice(0, SHEETS_MAX)) {
    if (budget <= 0) { truncated = true; break; }
    const raw = s.data.map(row => row.map(toCell));
    const built = buildSheet(`sh${sheets.length + 1}`, String(s.sheet).slice(0, 80), raw, budget);
    if (built.cells === 0) continue;
    sheets.push(built.sheet);
    budget -= built.cells;
    truncated ||= built.truncated;
  }
  if (sheets.length === 0) throw new FileRejected("EMPTY");
  return {
    kind: "xlsx",
    content: { type: "sheets", sheets },
    unitCount: sheets.length,
    charCount: sheets.reduce((n, s) => n + sheetChars(s), 0),
    truncated,
  };
}
