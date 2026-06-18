import { z } from "zod";
import { DATE_RE } from "@/lib/dates";

export const createSemesterInput = z.object({
  label:     z.string().trim().min(1),
  startDate: z.string().regex(DATE_RE),
  endDate:   z.string().regex(DATE_RE),
});
export type CreateSemesterInput = z.infer<typeof createSemesterInput>;

/**
 * Partial update for an existing semester — used by the no-active-semester gate's
 * "extend current" action (push the end date out + reactivate). At least one field
 * must be present so the route can tell an update apart from a bare activate.
 * Dates are zero-padded YYYY-MM-DD, so lexicographic comparison is correct.
 */
export const updateSemesterInput = z
  .object({
    label:     z.string().trim().min(1).optional(),
    startDate: z.string().regex(DATE_RE).optional(),
    endDate:   z.string().regex(DATE_RE).optional(),
  })
  .refine(v => v.label !== undefined || v.startDate !== undefined || v.endDate !== undefined, {
    message: "At least one field is required.",
  });
export type UpdateSemesterInput = z.infer<typeof updateSemesterInput>;
