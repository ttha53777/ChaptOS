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

// A drag-reorder: the complete ordered id list for the section being reordered.
// The service writes dense 0..n-1 positions from this order (one sequential
// round-trip each), so a partial or duplicated list is rejected against the
// section's live membership. Capped well above any realistic section size — the
// service persists sequentially, so an unbounded list would be a slow request.
const orderedIds = z.array(z.number().int().positive()).max(500);

// Reorder the docs within one section. folderId scopes the section (null =
// library root / Unfiled); orderedIds is every doc in it, in the new order.
export const reorderDocsInput = z.object({
  folderId,
  orderedIds,
});
export type ReorderDocsInput = z.infer<typeof reorderDocsInput>;

// Reorder the (unpinned) folder sections. orderedIds is every folder, in the
// new order; pinned folders still float ahead regardless of position.
export const reorderFoldersInput = z.object({
  orderedIds,
});
export type ReorderFoldersInput = z.infer<typeof reorderFoldersInput>;
