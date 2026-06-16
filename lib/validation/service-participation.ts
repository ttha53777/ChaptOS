import { z } from "zod";

// A single service stint can't reasonably exceed a few days of hours; cap well
// above any real event so typos (e.g. an extra zero) are rejected, not summed.
const MAX_HOURS = 1000;

// Log (upsert) the per-member hours for one service event. `entries` replaces
// the hours for the listed members; members not listed are left untouched.
// hours: 0 is allowed (record attendance with no hours yet). An empty entries
// array is rejected — there's nothing to log.
export const logParticipationInput = z.object({
  entries: z.array(z.object({
    brotherId: z.number().int().positive(),
    hours:     z.coerce.number().finite().nonnegative().max(MAX_HOURS),
  })).min(1),
});
export type LogParticipationInput = z.infer<typeof logParticipationInput>;

// Self-service log: a member records their own hours for one event. No brotherId —
// the actor is taken from the request context, so a member can only log for themself.
export const logMyParticipationInput = z.object({
  hours: z.coerce.number().finite().nonnegative().max(MAX_HOURS),
});
export type LogMyParticipationInput = z.infer<typeof logMyParticipationInput>;

// Update a single participation row's hours in place.
export const updateParticipationInput = z.object({
  hours: z.coerce.number().finite().nonnegative().max(MAX_HOURS),
});
export type UpdateParticipationInput = z.infer<typeof updateParticipationInput>;
