import { z } from "zod";
import { DATE_RE } from "@/lib/dates";

export const createSemesterInput = z.object({
  label:     z.string().trim().min(1),
  startDate: z.string().regex(DATE_RE),
  endDate:   z.string().regex(DATE_RE),
});
export type CreateSemesterInput = z.infer<typeof createSemesterInput>;
