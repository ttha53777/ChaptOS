import { z } from "zod";
import { DATE_RE } from "@/lib/dates";

export const createServiceEventInput = z.object({
  title:     z.string().trim().min(1),
  date:      z.string().regex(DATE_RE),
  time:      z.string().optional(),
  location:  z.string().optional(),
  // accept either name from clients (notes for service page, description for calendar)
  notes:       z.string().optional(),
  description: z.string().optional(),
  mandatory: z.boolean().optional(),
});
export type CreateServiceEventInput = z.infer<typeof createServiceEventInput>;

export const updateServiceEventInput = z.object({
  title:    z.string().min(1).optional(),
  date:     z.string().regex(DATE_RE).optional(),
  location: z.string().optional(),
  notes:    z.string().optional(),
});
export type UpdateServiceEventInput = z.infer<typeof updateServiceEventInput>;
