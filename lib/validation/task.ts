import { z } from "zod";
import { TASK_EVERYONE_MODES, TASK_STATUSES } from "@/lib/state";
import { isValidCalendarDate } from "@/lib/dates";

const idArray = z.array(z.number().int().positive());
const everyoneMode = z.enum(TASK_EVERYONE_MODES as readonly [string, ...string[]]);

// A real "YYYY-MM-DD" calendar date: rejects impossible dates (2026-02-31) that
// the shape-only DATE_RE would let through and that downstream urgency math
// would silently roll over to a different day.
const dateString = z.string().refine(isValidCalendarDate, { message: "Must be a valid date (YYYY-MM-DD)" });

// A 24h "HH:MM" wall-clock time on the due date (mirrors CHECK task_due_time_shape).
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Must be a time (HH:MM)" });

export const createTaskInput = z
  .object({
    title:              z.string().trim().min(1).max(200),
    dueDate:            dateString.optional(),
    dueTime:            timeString.optional(),
    notes:              z.string().trim().max(2000).optional(),
    assigneeBrotherIds: idArray.default([]),
    assigneeRoleIds:    idArray.default([]),
    // "any" | "each" assigns the whole roster live (assignee ids are ignored).
    everyone:           everyoneMode.optional(),
  })
  .refine(d => d.everyone != null || d.assigneeBrotherIds.length + d.assigneeRoleIds.length > 0, {
    message: "A task needs at least one assignee (a member, a role, or everyone)",
    path: ["assigneeBrotherIds"],
  })
  .refine(d => d.dueTime == null || d.dueDate != null, {
    message: "A due time needs a due date",
    path: ["dueTime"],
  });
export type CreateTaskInput = z.infer<typeof createTaskInput>;

// All fields optional — a PATCH may touch status only (assignee marking done) or
// any subset of the editable fields (manager edit). When an assignee-id array is
// present it REPLACES that side of the assignment set; absent = leave untouched.
// `dueDate: null` explicitly clears the date (turns a deadline into a loose to-do)
// and its time with it. `dueTime: null` keeps the date, any time that day.
// `everyone` set → assign the whole roster; `everyone: null` (or an assignee
// array) → back to the members/roles given.
export const updateTaskInput = z.object({
  title:              z.string().trim().min(1).max(200).optional(),
  dueDate:            dateString.nullable().optional(),
  dueTime:            timeString.nullable().optional(),
  notes:              z.string().trim().max(2000).nullable().optional(),
  status:             z.enum(TASK_STATUSES as readonly [string, ...string[]]).optional(),
  assigneeBrotherIds: idArray.optional(),
  assigneeRoleIds:    idArray.optional(),
  everyone:           everyoneMode.nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;
