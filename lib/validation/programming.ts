import { z } from "zod";
import { DATE_RE } from "@/lib/dates";

export const createProgrammingTaskInput = z.object({
  title:    z.string().trim().min(1).max(200),
  dueDate:  z.string().regex(DATE_RE),
  location: z.string().trim().min(1).max(200),
  time:     z.string().trim().max(50).nullable().optional(),
  collab:   z.string().trim().max(200).nullable().optional(),
  status:   z.string().min(1),
  type:     z.string().min(1),
});
export type CreateProgrammingTaskInput = z.infer<typeof createProgrammingTaskInput>;

export const updateProgrammingTaskInput = z.object({
  title:    z.string().trim().min(1).max(200).optional(),
  dueDate:  z.string().regex(DATE_RE).optional(),
  location: z.string().trim().min(1).max(200).optional(),
  time:     z.string().trim().max(50).nullable().optional(),
  collab:   z.string().trim().max(200).nullable().optional(),
  status:   z.string().min(1).optional(),
  type:     z.string().min(1).optional(),
});
export type UpdateProgrammingTaskInput = z.infer<typeof updateProgrammingTaskInput>;
