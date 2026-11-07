/**
 * Identify an uploaded file from its leading bytes — never from the browser's
 * MIME type or the extension, both of which the uploader controls. Same posture
 * as sniff() in lib/supabase/receipts.ts.
 */
import { FileRejected, type AttachmentKind } from "./types";
import type { ZipEntryInfo } from "./zip-preflight";

export type Sniffed =
  | { kind: "pdf" }
  | { kind: "zip" }
  | { kind: "csv" | "txt"; text: string };

function startsWith(b: Buffer, bytes: number[]): boolean {
  return b.length >= bytes.length && bytes.every((v, i) => b[i] === v);
}

/** UTF-16LE "EncryptedPackage": the stream Office writes when a .docx/.xlsx has a password. */
const ENCRYPTED_PACKAGE = Buffer.from("EncryptedPackage", "utf16le");

function decodeText(b: Buffer): string | null {
  try {
    if (startsWith(b, [0xff, 0xfe])) return new TextDecoder("utf-16le", { fatal: true }).decode(b.subarray(2));
    if (startsWith(b, [0xfe, 0xff])) return new TextDecoder("utf-16be", { fatal: true }).decode(b.subarray(2));
    const body = startsWith(b, [0xef, 0xbb, 0xbf]) ? b.subarray(3) : b;
    if (body.includes(0)) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

/**
 * First pass: what container is this? Throws FileRejected for formats we never
 * read (images, legacy OLE Office files, arbitrary binary).
 */
export function sniff(b: Buffer, originalName: string): Sniffed {
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: "pdf" };      // %PDF-
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return { kind: "zip" };            // PK\3\4
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {          // OLE compound file
    // A password-protected .docx/.xlsx is an OLE wrapper too; say so rather
    // than calling it an old format the member never used.
    throw new FileRejected(b.includes(ENCRYPTED_PACKAGE) ? "ENCRYPTED" : "LEGACY_FORMAT");
  }
  // Images get their own explicit rejection: scans are a later phase.
  if (startsWith(b, [0xff, 0xd8, 0xff]) || startsWith(b, [0x89, 0x50, 0x4e, 0x47]) ||
      startsWith(b, [0x47, 0x49, 0x46, 0x38])) {
    throw new FileRejected("UNSUPPORTED_TYPE");
  }
  const text = decodeText(b);
  if (text === null) throw new FileRejected("UNSUPPORTED_TYPE");
  return { kind: /\.(csv|tsv)$/i.test(originalName.trim()) ? "csv" : "txt", text };
}

/** Second pass for zips: which Office format, from the entries preflight found. */
export function classifyZip(entries: ZipEntryInfo[]): AttachmentKind {
  const names = new Set(entries.map(e => e.name));
  // A macro project is code; we don't read files that carry it.
  if (entries.some(e => /(^|\/)vbaProject\.bin$/i.test(e.name))) throw new FileRejected("UNSUPPORTED_TYPE");
  if (names.has("word/document.xml")) return "docx";
  if (names.has("xl/workbook.xml")) return "xlsx";
  throw new FileRejected("UNSUPPORTED_TYPE");
}
