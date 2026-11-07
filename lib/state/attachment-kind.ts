/** What an Ask Chapt attachment was read as. Identified by its bytes, never its extension. */
export const AttachmentKind = {
  Pdf:  "pdf",
  Docx: "docx",
  Xlsx: "xlsx",
  Csv:  "csv",
  Txt:  "txt",
} as const;

export type AttachmentKind = (typeof AttachmentKind)[keyof typeof AttachmentKind];

export const ATTACHMENT_KINDS: readonly AttachmentKind[] = Object.values(AttachmentKind);

export function isAttachmentKind(value: unknown): value is AttachmentKind {
  return typeof value === "string" && (ATTACHMENT_KINDS as readonly string[]).includes(value);
}
