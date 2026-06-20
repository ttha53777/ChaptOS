import { z } from "zod";
import { TASK_STATUSES } from "@/lib/state";
import { DATE_RE } from "@/lib/dates";

const idArray = z.array(z.number().int().positive());

export const createTaskInput = z
  .object({
    title:              z.string().trim().min(1).max(200),
    dueDate:            z.string().regex(DATE_RE).optional(),
    notes:              z.string().trim().max(2000).optional(),
    assigneeBrotherIds: idArray.default([]),
    assigneeRoleIds:    idArray.default([]),
  })
  .refine(d => d.assigneeBrotherIds.length + d.assigneeRoleIds.length > 0, {
    message: "A task needs at least one assignee (a member or a role)",
    path: ["assigneeBrotherIds"],
  });
export type CreateTaskInput = z.infer<typeof createTaskInput>;

// All fields optional — a PATCH may touch status only (assignee marking done) or
// any subset of the editable fields (manager edit). When an assignee-id array is
// present it REPLACES that side of the assignment set; absent = leave untouched.
// `dueDate: null` explicitly clears the date (turns a deadline into a loose to-do).
export const updateTaskInput = z.object({
  title:              z.string().trim().min(1).max(200).optional(),
  dueDate:            z.string().regex(DATE_RE).nullable().optional(),
  notes:              z.string().trim().max(2000).nullable().optional(),
  status:             z.enum(TASK_STATUSES as readonly [string, ...string[]]).optional(),
  assigneeBrotherIds: idArray.optional(),
  assigneeRoleIds:    idArray.optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;
