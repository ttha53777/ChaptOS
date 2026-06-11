import { z } from "zod";
import { DATE_RE } from "@/lib/dates";
import { ROOM_STATUSES } from "@/lib/state/programming-prep";
import { httpsUrl } from "./shared";

const optionalHttpsUrl = httpsUrl("URL must be valid http(s)").nullable().optional();

export const createProgrammingTaskInput = z.object({
  title:    z.string().trim().min(1).max(200),
  dueDate:  z.string().regex(DATE_RE),
  location: z.string().trim().min(1).max(200),
  time:     z.string().trim().max(50).nullable().optional(),
  collab:   z.string().trim().max(200).nullable().optional(),
  owner:    z.string().trim().max(200).optional(),
  status:   z.string().min(1),
  type:     z.string().min(1),
});
export type CreateProgrammingTaskInput = z.infer<typeof createProgrammingTaskInput>;

export const updateProgrammingTaskInput = z.object({
  title:           z.string().trim().min(1).max(200).optional(),
  dueDate:         z.string().regex(DATE_RE).optional(),
  location:        z.string().trim().min(1).max(200).optional(),
  time:            z.string().trim().max(50).nullable().optional(),
  collab:          z.string().trim().max(200).nullable().optional(),
  owner:           z.string().trim().max(200).optional(),
  status:          z.string().min(1).optional(),
  type:            z.string().min(1).optional(),
  description:     z.string().max(5000).nullable().optional(),
  itineraryUrl:    optionalHttpsUrl,
  roomStatus:      z.enum(ROOM_STATUSES).optional(),
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
