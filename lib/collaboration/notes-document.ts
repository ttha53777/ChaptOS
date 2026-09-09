import * as Y from "yjs";
import { ValidationError } from "@/lib/errors";
import { NOTES_BYTE_LIMIT, NOTES_TEXT_LIMIT } from "./notes-protocol";

export function decodeNotes(value: string): Uint8Array {
  if (!value || value.length > 2_000_000 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new ValidationError("Invalid meeting notes encoding.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new ValidationError("Invalid meeting notes encoding.");
  if (bytes.byteLength > NOTES_BYTE_LIMIT) throw new ValidationError("Meeting notes are too large.");
  return bytes;
}

export function encodeNotes(doc: Y.Doc): Uint8Array {
  const bytes = Y.encodeStateAsUpdate(doc);
  if (bytes.byteLength > NOTES_BYTE_LIMIT) throw new ValidationError("Meeting notes are too large.");
  return bytes;
}

export function validateNotesDoc(doc: Y.Doc): string {
  // Predeclare the expected root before applying updates: Yjs otherwise lazily
  // materializes remote roots as AbstractType until getText() is called.
  if ([...doc.share.keys()].some(key => key !== "notes")) throw new ValidationError("Unsupported meeting notes document.");
  if (doc.store.pendingStructs || doc.store.pendingDs) throw new ValidationError("Incomplete meeting notes document. Reconnect and try again.");
  const text = doc.getText("notes");
  const delta = text.toDelta();
  if (Object.keys(text.getAttributes()).length || delta.some((part: { insert: unknown; attributes?: Record<string, unknown> }) => typeof part.insert !== "string" || (part.attributes && Object.keys(part.attributes).length))) {
    throw new ValidationError("Meeting notes must contain plain text.");
  }
  if (text.length > NOTES_TEXT_LIMIT) throw new ValidationError("Meeting notes exceed 50,000 characters.");
  return text.toString();
}

export function loadNotes(bytes: Uint8Array): Y.Doc {
  if (bytes.byteLength > NOTES_BYTE_LIMIT) throw new ValidationError("Meeting notes are too large.");
  const doc = new Y.Doc();
  doc.getText("notes");
  try {
    Y.applyUpdate(doc, bytes);
    validateNotesDoc(doc);
    return doc;
  } catch (error) {
    doc.destroy();
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Invalid meeting notes document.");
  }
}

export function seedNotes(value: string): Uint8Array {
  const doc = new Y.Doc();
  try {
    doc.getText("notes").insert(0, value);
    validateNotesDoc(doc);
    return encodeNotes(doc);
  } finally { doc.destroy(); }
}
