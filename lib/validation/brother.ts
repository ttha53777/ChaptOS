import { z } from "zod";

// Custom field values — values are validated against org definitions server-side
// in the service layer. We accept a loose record here and sanitize tightly there.
const customFieldsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional();

export const createBrotherInput = z.object({
  name:         z.string().min(1).max(200),
  role:         z.string().min(1),
  duesOwed:     z.coerce.number().nonnegative(),
  gpa:          z.coerce.number().nonnegative(),
  serviceHours: z.coerce.number().nonnegative(),
  // Custom field initial values are optional at creation — fields can be
  // filled in from the drawer immediately after the brother is added.
  customFields: customFieldsSchema,
});
export type CreateBrotherInput = z.infer<typeof createBrotherInput>;

export const updateBrotherInput = z.object({
  name:         z.string().min(1).optional(),
  role:         z.string().min(1).optional(),
  duesOwed:     z.coerce.number().nonnegative().optional(),
  gpa:          z.coerce.number().nonnegative().optional(),
  serviceHours: z.coerce.number().nonnegative().optional(),
  customFields: customFieldsSchema,
});
export type UpdateBrotherInput = z.infer<typeof updateBrotherInput>;
