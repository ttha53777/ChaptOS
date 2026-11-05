import { z } from "zod";
import { POLL_STATUSES } from "@/lib/state";
import { isValidCalendarDate } from "@/lib/dates";

const idArray = z.array(z.number().int().positive());

// A real "YYYY-MM-DD" calendar date (mirrors lib/validation/task.ts): rejects
// impossible dates the shape-only regex would let through.
const dateString = z.string().refine(isValidCalendarDate, { message: "Must be a valid date (YYYY-MM-DD)" });

// 2-10 non-empty option labels. Trimmed; empties are rejected (the form should
// drop blank rows before submit, but guard here too).
const optionLabels = z.array(z.string().trim().min(1).max(200)).min(2, "A poll needs at least two options").max(10, "A poll can have at most ten options");

// Every new poll goes to the whole chapter and everyone is expected to vote, so
// there is no audience to pick. Assignee arrays are still accepted (and ignored)
// because app builds already on phones send them.
export const createPollInput = z.object({
  question:           z.string().trim().min(1).max(500),
  options:            optionLabels,
  closeDate:          dateString.optional(),
  assigneeBrotherIds: idArray.optional(),
  assigneeRoleIds:    idArray.optional(),
});
export type CreatePollInput = z.infer<typeof createPollInput>;

// All fields optional — a PATCH may flip status only (manager closes/reopens) or
// edit any subset. `closeDate: null` clears the date. Assignee arrays, when
// present, REPLACE that side of the set (older targeted polls only: an Everyone
// poll's audience can't be changed). `options`, when present, replaces the
// whole option set — rejected by the service if votes already exist.
export const updatePollInput = z.object({
  question:           z.string().trim().min(1).max(500).optional(),
  options:            optionLabels.optional(),
  closeDate:          dateString.nullable().optional(),
  status:             z.enum(POLL_STATUSES as readonly [string, ...string[]]).optional(),
  assigneeBrotherIds: idArray.optional(),
  assigneeRoleIds:    idArray.optional(),
});
export type UpdatePollInput = z.infer<typeof updatePollInput>;

export const castVoteInput = z.object({
  optionId: z.number().int().positive(),
});
