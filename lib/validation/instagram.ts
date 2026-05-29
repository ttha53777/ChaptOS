import { z } from "zod";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const createInstagramTaskInput = z.object({
  title:   z.string().trim().min(1).max(200),
  dueDate: z.string().regex(DATE_RE),
  owner:   z.string().trim().min(1).max(200),
  status:  z.string().min(1),
  type:    z.string().min(1),
});
export type CreateInstagramTaskInput = z.infer<typeof createInstagramTaskInput>;

export const updateInstagramTaskInput = z.object({
  title:   z.string().trim().min(1).max(200).optional(),
  dueDate: z.string().regex(DATE_RE).optional(),
  owner:   z.string().trim().min(1).max(200).optional(),
  status:  z.string().min(1).optional(),
  type:    z.string().min(1).optional(),
});
export type UpdateInstagramTaskInput = z.infer<typeof updateInstagramTaskInput>;
