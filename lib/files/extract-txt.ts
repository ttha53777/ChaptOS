import { FileRejected, type Extracted, type TextUnit } from "./types";
import { FILE_MAX_CHARS } from "./limits";
import { capUnits, carryTableHeaders } from "./units";

const LINES_PER_BLOCK = 80;
const BLOCK_MAX_CHARS = 4_000;

/** Plain text in blocks of up to 80 lines ("Lines 81–160"), cut sooner when a block runs long. */
export function extractTxt(text: string): Extracted {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.trim()) throw new FileRejected("EMPTY");
  const lines = normalized.split("\n");
  const units: TextUnit[] = [];
  const push = (label: string, body: string) => units.push({ ref: `l${units.length + 1}`, label, text: body });

  let start = 0;
  while (start < lines.length) {
    const line = lines[start];
    if (line.length > BLOCK_MAX_CHARS) {
      // One enormous line (minified data, a pasted wall): split it on its own.
      for (let i = 0, part = 1; i < line.length; i += BLOCK_MAX_CHARS, part++) {
        push(`Line ${start + 1} (part ${part})`, line.slice(i, i + BLOCK_MAX_CHARS));
      }
      start++;
      continue;
    }
    let end = start;
    let size = 0;
    while (end < lines.length && end - start < LINES_PER_BLOCK && lines[end].length <= BLOCK_MAX_CHARS && size + lines[end].length <= BLOCK_MAX_CHARS) {
      size += lines[end].length + 1;
      end++;
    }
    const body = lines.slice(start, end).join("\n");
    if (body.trim()) push(end - start === 1 ? `Line ${start + 1}` : `Lines ${start + 1}–${end}`, body);
    start = end;
  }
  const carried = carryTableHeaders(units.map(u => u.text));
  const capped = capUnits(units.map((u, i) => ({ ...u, text: carried[i] })), FILE_MAX_CHARS);
  return { kind: "txt", content: { type: "text", units: capped.units }, unitCount: capped.units.length, charCount: capped.chars, truncated: capped.truncated };
}
