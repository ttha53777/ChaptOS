import { z } from "zod";
import { DATE_RE, isValidCalendarDate } from "@/lib/dates";
import { INSTAGRAM_STATUSES } from "@/lib/state/instagram-status";
export { INSTAGRAM_STATUSES, type InstagramStatus } from "@/lib/state/instagram-status";
const calendarDate = z.string().regex(DATE_RE).refine(isValidCalendarDate, "Choose a valid calendar date");

// Canonical post types — the single source of truth for the allowed values.
// Re-used by the AI tools (IG_TYPES) and the data layer's InstagramTask.type.
export const INSTAGRAM_TYPES = ["Story", "Reel", "Carousel"] as const;
export type InstagramType = (typeof INSTAGRAM_TYPES)[number];
const instagramType = z.enum(INSTAGRAM_TYPES);

// Binary post status — mirrors Task's open|done. Urgency is computed from
// dueDate, never stored. "posted" is reached via "Mark posted".
const instagramStatus = z.enum(INSTAGRAM_STATUSES);

export const createInstagramTaskInput = z.object({
  title:   z.string().trim().min(1).max(200),
  dueDate: calendarDate,
  // No status on create — new posts default to "open" at the DB.
  type:    instagramType,
  // Optional soft link to the event this post promotes.
  calendarEventId: z.number().int().positive().nullable().optional(),
});
export type CreateInstagramTaskInput = z.infer<typeof createInstagramTaskInput>;

export const updateInstagramTaskInput = z.object({
  title:   z.string().trim().min(1).max(200).optional(),
  dueDate: calendarDate.optional(),
  // The actual day the post went live. Send a date to set it, null to clear,
  // omit to leave unchanged. Only meaningful once the post is "posted".
  postedDate: calendarDate.nullable().optional(),
  status:  instagramStatus.optional(),
  // Retired labels may only be preserved, never newly assigned (service guard).
  type:    z.string().trim().min(1).max(100).optional(),
  // Send a number to link, null to clear, omit to leave unchanged.
  calendarEventId: z.number().int().positive().nullable().optional(),
});
export type UpdateInstagramTaskInput = z.infer<typeof updateInstagramTaskInput>;
