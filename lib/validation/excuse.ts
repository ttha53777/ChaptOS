import { z } from "zod";

export const submitExcuseInput = z.object({
  calendarEventId: z.number().int().positive(),
  /** Only honored when caller is admin/platform admin; otherwise ignored. */
  brotherId: z.number().int().positive().optional(),
  reason:    z.string().trim().min(1).max(1000),
});
export type SubmitExcuseInput = z.infer<typeof submitExcuseInput>;

export const decideExcuseInput = z.object({
  action:        z.enum(["approve", "reject"]),
  rejectionNote: z.string().trim().max(1000).optional(),
});
export type DecideExcuseInput = z.infer<typeof decideExcuseInput>;
