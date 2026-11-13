import { z } from "zod";

/** GET /api/home?today=YYYY-MM-DD — the phone's local date. Optional. */
export const homeQuery = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "today must be YYYY-MM-DD").optional(),
});
export type HomeQuery = z.infer<typeof homeQuery>;
