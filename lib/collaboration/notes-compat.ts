import { ConflictError } from "@/lib/errors";

/** Use under the same row lock as the eventual legacy update. */
export function guardLegacyNotes(existing: { notesDoc: Uint8Array | null; description: string | null; category: string }, input: { description?: string | null; category?: string }): void {
  if (!existing.notesDoc) return;
  if (input.category !== undefined && input.category !== existing.category) {
    throw new ConflictError("This meeting has shared notes. Its event type cannot be changed.");
  }
  if (input.description !== undefined && (input.description ?? "") !== (existing.description ?? "")) {
    throw new ConflictError("These notes are now shared. Reopen the meeting to edit them; your draft has not been saved.");
  }
}

/** Never leak CRDT bytes through general-purpose calendar DTOs. */
export function withoutNotesDoc<T extends { notesDoc?: unknown }>(row: T): Omit<T, "notesDoc"> & { notesInitialized: boolean } {
  const { notesDoc: _doc, ...rest } = row;
  return { ...rest, notesInitialized: !!_doc };
}
