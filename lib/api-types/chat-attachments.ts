// Ask Chapt file attachments (/api/ai/attachments). Type-only: see lib/api-types/index.ts for the rules.
//
// A member attaches a file to one conversation; the server extracts its text or
// sheets once and discards the original bytes. Attachments are private to the
// uploader. The conversation names them on every chat request by `id`.

export type AttachmentKind = "pdf" | "docx" | "xlsx" | "csv" | "txt";

/** One attached file, as the composer tray shows it. */
export interface ChatAttachmentInfo {
  /** Public id (a UUID). Send it in ChatRequest.attachmentIds. */
  id: string;
  name: string;
  kind: AttachmentKind;
  sizeBytes: number;
  /** Pages, sections, sheets or blocks read — see unitNoun. */
  unitCount: number;
  unitNoun: "page" | "section" | "sheet" | "block";
  /** The file was longer than the stored limit; only the first unitCount units were kept. */
  truncated: boolean;
  createdAt: string;
  /** After this the file is gone; each chat turn that uses it pushes it out (up to 30 days from upload). */
  expiresAt: string;
}

/**
 * GET /api/ai/attachments/[id]/units/[ref] — the extracted text behind a
 * citation. A document unit has `text`; a sheet range has `grid` (rows of cells,
 * header row first when the sheet has one).
 */
export interface AttachmentUnit {
  label: string;
  text: string | null;
  grid: (string | number | boolean | null)[][] | null;
}

/** What the composer may offer, from GET /api/ai/chat. */
export interface FileLimits {
  maxBytes: number;
  maxFiles: number;
  /** For the file picker's accept list only — the server identifies files by their bytes. */
  extensions: string[];
}
