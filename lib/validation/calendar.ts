import { scheduleSchema, dateSchema } from "@/lib/calendar-feed/schedule";
import { z } from "zod";
import { eventDetailsSchema } from "@/lib/event-details";
import { repeatSchema } from "@/lib/event-repeat";

// Category is now a per-org CalendarEventType slug, not a fixed enum. Zod only
// checks the shape (kebab-case, bounded); the calendar service validates the slug
// against the org's CalendarEventType rows and returns a friendly error.
export const CATEGORY_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createCalendarInput = z.object({
  schedule: scheduleSchema.nullable().optional(),
  title:       z.string().trim().min(1).max(200),
  date:        dateSchema,
  category:    z.string().trim().min(1).max(50).regex(CATEGORY_SLUG_RE),
  mandatory:   z.boolean(),
  time:        z.string().nullable().optional(),
  description: z.string().max(50000).nullable().optional(),
  location:    z.string().nullable().optional(),
  owner:       z.string().max(200).optional(),
  status:      z.string().max(50).optional(),
  // Start the meeting's notes from this agenda template (chapter meetings only).
  // The server fills its blanks from the schedule; the client never sends the text.
  agendaTemplateId: z.number().int().positive().nullable().optional(),
  // "More details" (lib/event-details.ts). rememberDetails saves a blank copy of
  // them as the event type's template — or clears it when false.
  details:         eventDetailsSchema.nullable().optional(),
  rememberDetails: z.boolean().optional(),
  // Also create the same event every week / every other week through `until`
  // (lib/event-repeat.ts). Each one is its own event; there is no series row.
  repeat: repeatSchema.optional(),
});
export type CreateCalendarInput = z.infer<typeof createCalendarInput>;

export const updateCalendarInput = z.object({
  schedule: scheduleSchema.nullable().optional(),
  title:       z.string().nullable().optional(),
  date:        dateSchema.nullable().optional(),
  time:        z.string().nullable().optional(),
  category:    z.string().trim().min(1).max(50).regex(CATEGORY_SLUG_RE).optional(),
  mandatory:   z.boolean().optional(),
  description: z.string().max(50000).nullable().optional(),
  location:    z.string().nullable().optional(),
  owner:       z.string().max(200).optional(),
  status:      z.string().max(50).optional(),
  // "More details" (lib/event-details.ts). rememberDetails saves a blank copy of
  // them as the event type's template — or clears it when false.
  details:         eventDetailsSchema.nullable().optional(),
  rememberDetails: z.boolean().optional(),
});
export type UpdateCalendarInput = z.infer<typeof updateCalendarInput>;
