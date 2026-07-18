import { z } from "zod";
import { DATE_RE } from "@/lib/dates";

// Category is now a per-org CalendarEventType slug, not a fixed enum. Zod only
// checks the shape (kebab-case, bounded); the calendar service validates the slug
// against the org's CalendarEventType rows and returns a friendly error.
const CATEGORY_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createCalendarInput = z.object({
  title:       z.string().trim().min(1).max(200),
  date:        z.string().regex(DATE_RE),
  category:    z.string().trim().min(1).max(50).regex(CATEGORY_SLUG_RE),
  mandatory:   z.boolean(),
  time:        z.string().nullable().optional(),
  description: z.string().max(50000).nullable().optional(),
  location:    z.string().nullable().optional(),
  owner:       z.string().max(200).optional(),
  status:      z.string().max(50).optional(),
}).refine(d => d.category !== "chapter" || d.mandatory, {
  message: "Chapter events must be mandatory",
  path: ["mandatory"],
});
export type CreateCalendarInput = z.infer<typeof createCalendarInput>;

export const updateCalendarInput = z.object({
  title:       z.string().nullable().optional(),
  date:        z.string().regex(DATE_RE).nullable().optional(),
  time:        z.string().nullable().optional(),
  category:    z.string().trim().min(1).max(50).regex(CATEGORY_SLUG_RE).optional(),
  mandatory:   z.boolean().optional(),
  description: z.string().max(50000).nullable().optional(),
  location:    z.string().nullable().optional(),
  owner:       z.string().max(200).optional(),
  status:      z.string().max(50).optional(),
});
export type UpdateCalendarInput = z.infer<typeof updateCalendarInput>;
