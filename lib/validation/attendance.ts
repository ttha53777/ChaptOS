import { z } from "zod";

// Two shapes. `changes` is what the sheet sends: only the rows the officer
// actually flipped, so nobody else's row is touched — a member who taps "I'm
// here" while the sheet is open keeps their check-in. `attendedIds` is the old
// full-roll snapshot (everyone not listed becomes absent); kept for clients
// that still send it.
export const recordAttendanceInput = z.object({
  calendarEventId: z.number().int().positive(),
  attendedIds:     z.array(z.number().int().positive()).optional(),
  changes:         z.array(z.object({
    brotherId: z.number().int().positive(),
    attended:  z.boolean(),
  })).optional(),
}).refine(v => (v.attendedIds === undefined) !== (v.changes === undefined), {
  message: "Send exactly one of attendedIds or changes",
});
export type RecordAttendanceInput = z.infer<typeof recordAttendanceInput>;

// Officer control of the live check-in window. The event id comes from the path.
export const checkInWindowInput = z.object({
  action: z.enum(["open", "close", "reopen", "cancel", "restore"]),
});
export type CheckInWindowInput = z.infer<typeof checkInWindowInput>;

// Self check-in carries NO body. brotherId must never be accepted from the
// client — the actor is taken from the request context, so a member can only
// ever check themself in (same rule as logMyParticipationInput).
