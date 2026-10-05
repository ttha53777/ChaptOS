import { scheduleSchema, dateSchema } from "@/lib/calendar-feed/schedule";
import { z } from "zod";

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
});
export type UpdateCalendarInput = z.infer<typeof updateCalendarInput>;
