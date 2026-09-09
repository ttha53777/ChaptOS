import { DomainError, ValidationError } from "@/lib/errors";
import { NOTES_BODY_LIMIT } from "./notes-protocol";

/** Enforce actual streamed bytes, including when Content-Length is missing. */
export async function readNotesBody(request: Request): Promise<unknown> {
  const tooLarge = () => new DomainError("VALIDATION", "Meeting notes are too large.", 413);
  if (Number(request.headers.get("content-length")) > NOTES_BODY_LIMIT) throw tooLarge();
  if (!request.body) throw new ValidationError("Missing notes payload.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > NOTES_BODY_LIMIT) { await reader.cancel(); throw tooLarge(); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ValidationError("Invalid notes payload."); }
}
