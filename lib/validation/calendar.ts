import { z } from "zod";
import { CALENDAR_CATEGORIES } from "@/lib/state";
import { DATE_RE } from "@/lib/dates";

export const createCalendarInput = z.object({
  title:       z.string().trim().min(1).max(200),
  date:        z.string().regex(DATE_RE),
  category:    z.enum(CALENDAR_CATEGORIES as readonly [string, ...string[]]),
  mandatory:   z.boolean(),
  time:        z.string().nullable().optional(),
  description: z.string().max(50000).nullable().optional(),
  location:    z.string().nullable().optional(),
}).refine(d => d.category !== "chapter" || d.mandatory, {
  message: "Chapter events must be mandatory",
  path: ["mandatory"],
});
export type CreateCalendarInput = z.infer<typeof createCalendarInput>;

export const updateCalendarInput = z.object({
  title:       z.string().nullable().optional(),
  date:        z.string().regex(DATE_RE).nullable().optional(),
  time:        z.string().nullable().optional(),
  category:    z.enum(CALENDAR_CATEGORIES as readonly [string, ...string[]]).optional(),
  mandatory:   z.boolean().optional(),
  description: z.string().max(50000).nullable().optional(),
  location:    z.string().nullable().optional(),
});
export type UpdateCalendarInput = z.infer<typeof updateCalendarInput>;
