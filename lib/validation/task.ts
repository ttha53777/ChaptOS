import { z } from "zod";
import { TASK_STATUSES } from "@/lib/state";
import { isValidCalendarDate } from "@/lib/dates";

const idArray = z.array(z.number().int().positive());

// A real "YYYY-MM-DD" calendar date: rejects impossible dates (2026-02-31) that
// the shape-only DATE_RE would let through and that downstream urgency math
// would silently roll over to a different day.
const dateString = z.string().refine(isValidCalendarDate, { message: "Must be a valid date (YYYY-MM-DD)" });

export const createTaskInput = z
  .object({
    title:              z.string().trim().min(1).max(200),
    dueDate:            dateString.optional(),
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
  dueDate:            dateString.nullable().optional(),
  notes:              z.string().trim().max(2000).nullable().optional(),
  status:             z.enum(TASK_STATUSES as readonly [string, ...string[]]).optional(),
  assigneeBrotherIds: idArray.optional(),
  assigneeRoleIds:    idArray.optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;
