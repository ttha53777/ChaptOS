import { z } from "zod";
import { NOTES_VERSION } from "@/lib/collaboration/notes-protocol";

export const notesId = z.coerce.number().int().positive();
export const notesReadInput = z.object({ afterSeq: z.coerce.number().int().nonnegative().optional() });
export const saveNotesInput = z.object({
  protocolVersion: z.literal(NOTES_VERSION),
  notesDoc: z.string().min(1).max(2_000_000),
  generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lastSeenSeq: z.number().int().nonnegative(),
}).strict();
export type SaveNotesInput = z.infer<typeof saveNotesInput>;
