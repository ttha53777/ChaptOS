import { z } from "zod";

/**
 * GET /api/activity query. With no params it is the dashboard card's read
 * (newest 20); the Activity spotlight pages through a window with all three.
 */
export const activityQuery = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  /** Cursor: return rows strictly older than this ActivityLog id's row. */
  before: z.coerce.number().int().positive().optional(),
  /** Only rows at or after this instant (the spotlight's Week/Month/Term). */
  since:  z.string().datetime({ offset: true }).optional(),
});
export type ActivityQuery = z.infer<typeof activityQuery>;
