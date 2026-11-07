/**
 * What extraction produces. Pure data, stored as ChatAttachment.content (JSON)
 * and read back by the Ask Chapt file tools.
 *
 * Documents are a list of addressable text units (a PDF page, a Word section, a
 * block of lines), each with a short `ref` the model cites ("p7", "s2", "l3").
 * Spreadsheets stay typed grids so arithmetic runs on the server, never in the
 * model.
 */
import type { AttachmentKind } from "@/lib/state/attachment-kind";

export type { AttachmentKind };

/** One spreadsheet cell. Dates are ISO strings; formulas arrive as their cached value. */
export type Cell = string | number | boolean | null;

/** ref: "p3" (PDF page), "s2" (Word section), "l1" (block of lines). */
export interface TextUnit { ref: string; label: string; text: string }

export interface SheetData {
  ref: string;               // "sh1"
  name: string;
  rowCount: number;
  colCount: number;
  /** 0-based index of the header row, or null when none was found. */
  headerRow: number | null;
  /** One label per column: the header text, or the column letter. */
  columns: string[];
  rows: Cell[][];
}

export type AttachmentContent =
  | { type: "text";   units: TextUnit[] }
  | { type: "sheets"; sheets: SheetData[] };

export interface Extracted {
  kind: AttachmentKind;
  content: AttachmentContent;
  unitCount: number;
  charCount: number;
  truncated: boolean;
}

export type FileErrorCode =
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "LEGACY_FORMAT"
  | "ENCRYPTED"
  | "NO_TEXT_LAYER"
  | "EMPTY"
  | "MALFORMED"
  | "TOO_MANY_FILES"
  | "QUOTA";

/**
 * Thrown by every extractor for a file it won't read. Carries only a code —
 * never parser text, which can quote the document — so it is safe to log.
 */
export class FileRejected extends Error {
  constructor(readonly code: FileErrorCode) {
    super(code);
    this.name = "FileRejected";
  }
}

/** What the member reads on the failed chip. */
export const FILE_ERROR_MESSAGES: Record<FileErrorCode, string> = {
  FILE_TOO_LARGE:   "That file is over 4 MB. Try a smaller export.",
  UNSUPPORTED_TYPE: "Ask Chapt can read PDF, Word (.docx), Excel (.xlsx), CSV and text files.",
  LEGACY_FORMAT:    "Old .doc / .xls files aren't supported. Save it as .docx / .xlsx and try again.",
  ENCRYPTED:        "This file is password-protected. Remove the password and try again.",
  NO_TEXT_LAYER:    "This PDF is scanned images, which Ask Chapt can't read yet.",
  EMPTY:            "There's no readable text in this file.",
  MALFORMED:        "This file looks damaged and couldn't be opened.",
  TOO_MANY_FILES:   "A conversation can hold 5 files. Remove one first.",
  QUOTA:            "You've reached today's upload limit. Try again tomorrow.",
};
