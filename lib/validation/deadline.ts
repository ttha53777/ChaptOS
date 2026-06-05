import { z } from "zod";
import { DATE_RE } from "@/lib/dates";

export const createDeadlineInput = z.object({
  title:   z.string().trim().min(1).max(200),
  dueDate: z.string().regex(DATE_RE),
  owner:   z.string().trim().min(1).max(200),
  status:  z.string().min(1),
});
export type CreateDeadlineInput = z.infer<typeof createDeadlineInput>;

export const updateDeadlineInput = z.object({
  title:   z.string().trim().min(1).max(200).optional(),
  dueDate: z.string().regex(DATE_RE).optional(),
  owner:   z.string().trim().min(1).max(200).optional(),
  status:  z.string().min(1).optional(),
});
export type UpdateDeadlineInput = z.infer<typeof updateDeadlineInput>;
