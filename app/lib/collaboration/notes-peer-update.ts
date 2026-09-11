import * as Y from "yjs";
import { NOTES_BYTE_LIMIT, NOTES_TEXT_LIMIT } from "@/lib/collaboration/notes-protocol";

/** Validate a candidate merge before mutating the live editor's document. */
export function applyPeerUpdate(doc: Y.Doc, update: Uint8Array, origin: unknown) {
  const candidate = new Y.Doc();
  candidate.getText("notes");
  try {
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(candidate, update);
    if ([...candidate.share.keys()].some(key => key !== "notes")) throw new Error("Unsupported peer document");
    const text = candidate.getText("notes");
    if (Object.keys(text.getAttributes()).length || text.length > NOTES_TEXT_LIMIT || Y.encodeStateAsUpdate(candidate).byteLength > NOTES_BYTE_LIMIT
      || text.toDelta().some((part: { insert: unknown; attributes?: object }) => typeof part.insert !== "string" || (part.attributes && Object.keys(part.attributes).length))) {
      throw new Error("Invalid peer document");
    }
    // Partial updates may be pending until the next peer/server reconciliation.
    Y.applyUpdate(doc, update, origin);
  } finally { candidate.destroy(); }
}
