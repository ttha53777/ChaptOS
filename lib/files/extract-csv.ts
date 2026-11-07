import Papa from "papaparse";
import { FileRejected, type Extracted } from "./types";
import { CELLS_MAX } from "./limits";
import { buildSheet, sheetChars, typeCell } from "./cells";

/** One sheet named after the file. Cells stay strings until typeCell reads a number. */
export function extractCsv(text: string, sheetName: string): Extracted {
  const parsed = Papa.parse<string[]>(text, { dynamicTyping: false, skipEmptyLines: true });
  const raw = parsed.data.filter(Array.isArray).map(row => row.map(v => typeCell(String(v ?? ""))));
  const { sheet, cells, truncated } = buildSheet("sh1", sheetName || "Sheet1", raw, CELLS_MAX);
  if (cells === 0) throw new FileRejected("EMPTY");
  return { kind: "csv", content: { type: "sheets", sheets: [sheet] }, unitCount: 1, charCount: sheetChars(sheet), truncated };
}
