import { z } from "zod";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const createSemesterInput = z.object({
  label:     z.string().trim().min(1),
  startDate: z.string().regex(DATE_RE),
  endDate:   z.string().regex(DATE_RE),
});
export type CreateSemesterInput = z.infer<typeof createSemesterInput>;
