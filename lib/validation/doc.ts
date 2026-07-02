import { z } from "zod";
import { httpsUrl } from "./shared";

const urlSchema = httpsUrl("URL must be valid http(s)");

// A doc's folder: a positive folder id, or null for the library root.
const folderId = z.number().int().positive().nullable();

export const createDocInput = z.object({
  title:       z.string().trim().min(1).max(200),
  url:         urlSchema,
  description: z.string().max(2000).optional().nullable(),
  folderId:    folderId.optional(),
});
export type CreateDocInput = z.infer<typeof createDocInput>;

export const updateDocInput = z.object({
  title:       z.string().trim().min(1).max(200).optional(),
  url:         urlSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
  folderId:    folderId.optional(),
});
export type UpdateDocInput = z.infer<typeof updateDocInput>;

export const createFolderInput = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateFolderInput = z.infer<typeof createFolderInput>;

export const renameFolderInput = z.object({
  name: z.string().trim().min(1).max(120),
});
export type RenameFolderInput = z.infer<typeof renameFolderInput>;

// folderId: null = move to root.
export const moveDocInput = z.object({
  folderId,
});
export type MoveDocInput = z.infer<typeof moveDocInput>;

// Pin / unpin a doc or folder. pinned true floats it to the top of the library.
export const pinInput = z.object({
  pinned: z.boolean(),
});
export type PinInput = z.infer<typeof pinInput>;
