import { z } from "zod";
import { DATE_RE } from "@/lib/dates";
import { ROOM_STATUSES } from "@/lib/state/programming-prep";
import { STAGES } from "@/lib/state/programming-stage";
import { httpsUrl } from "./shared";

const optionalHttpsUrl = httpsUrl("URL must be valid http(s)").nullable().optional();

// New events start in the Idea stage, where most fields are optional —
// they only become required when promoting to Planning+ (handled in setStage).
export const createProgrammingTaskInput = z.object({
  title:    z.string().trim().min(1).max(200),
  dueDate:  z.string().regex(DATE_RE).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  time:     z.string().trim().max(50).nullable().optional(),
  collab:   z.string().trim().max(200).nullable().optional(),
  owner:    z.string().trim().max(200).optional(),
  status:   z.string().min(1).optional(),
  type:     z.string().min(1),
  mandatory: z.boolean().optional(),
});
export type CreateProgrammingTaskInput = z.infer<typeof createProgrammingTaskInput>;

export const updateProgrammingTaskInput = z.object({
  title:           z.string().trim().min(1).max(200).optional(),
  dueDate:         z.string().regex(DATE_RE).nullable().optional(),
  location:        z.string().trim().max(200).nullable().optional(),
  time:            z.string().trim().max(50).nullable().optional(),
  collab:          z.string().trim().max(200).nullable().optional(),
  owner:           z.string().trim().max(200).optional(),
  status:          z.string().min(1).optional(),
  type:            z.string().min(1).optional(),
  mandatory:       z.boolean().optional(),
  description:     z.string().max(5000).nullable().optional(),
  itineraryUrl:    optionalHttpsUrl, // deprecated — use attachmentUrl
  attachmentUrl:   optionalHttpsUrl,
  attachmentDocId: z.number().int().positive().nullable().optional(),
  roomStatus:      z.enum(ROOM_STATUSES).optional(),
  itineraryNotNeeded: z.boolean().optional(),
  flyerPosted:     z.boolean().optional(),
  socialsMeeting:  z.boolean().optional(),
  spendingCents:   z.number().int().min(0).max(999_999_999).optional(),
  successRating:   z.number().int().min(1).max(5).nullable().optional(),
  wrapUpNotes:     z.string().max(5000).nullable().optional(),
});
export type UpdateProgrammingTaskInput = z.infer<typeof updateProgrammingTaskInput>;

export const attachProgrammingDocInput = z.object({
  title:       z.string().trim().min(1).max(200),
  url:         httpsUrl("URL must be valid http(s)"),
  description: z.string().max(2000).optional().nullable(),
});
export type AttachProgrammingDocInput = z.infer<typeof attachProgrammingDocInput>;

export const setStageInput = z.object({
  stage: z.enum(STAGES),
});
export type SetStageInput = z.infer<typeof setStageInput>;

export const createChecklistItemInput = z.object({
  label: z.string().trim().min(1).max(200),
});
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemInput>;

export const updateChecklistItemInput = z.object({
  label:     z.string().trim().min(1).max(200).optional(),
  done:      z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemInput>;
