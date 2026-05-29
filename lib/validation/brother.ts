import { z } from "zod";

export const createBrotherInput = z.object({
  name:         z.string().min(1).max(200),
  role:         z.string().min(1),
  duesOwed:     z.coerce.number().nonnegative(),
  gpa:          z.coerce.number().nonnegative(),
  serviceHours: z.coerce.number().nonnegative(),
});
export type CreateBrotherInput = z.infer<typeof createBrotherInput>;

export const updateBrotherInput = z.object({
  name:         z.string().min(1).optional(),
  role:         z.string().min(1).optional(),
  duesOwed:     z.coerce.number().nonnegative().optional(),
  gpa:          z.coerce.number().nonnegative().optional(),
  serviceHours: z.coerce.number().nonnegative().optional(),
});
export type UpdateBrotherInput = z.infer<typeof updateBrotherInput>;
