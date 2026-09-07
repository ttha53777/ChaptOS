import { z } from "zod";

export const recordAttendanceInput = z.object({
  calendarEventId: z.number().int().positive(),
  attendedIds:     z.array(z.number().int().positive()),
});
export type RecordAttendanceInput = z.infer<typeof recordAttendanceInput>;

// Officer control of the live check-in window. The event id comes from the path.
export const checkInWindowInput = z.object({
  action: z.enum(["open", "close", "reopen"]),
});
export type CheckInWindowInput = z.infer<typeof checkInWindowInput>;

// Self check-in carries NO body. brotherId must never be accepted from the
// client — the actor is taken from the request context, so a member can only
// ever check themself in (same rule as logMyParticipationInput).
