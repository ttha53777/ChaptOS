import { scheduleSchema, dateSchema } from "@/lib/calendar-feed/schedule";
import { z } from "zod";

export const createServiceEventInput = z.object({
  schedule: scheduleSchema.nullable().optional(),
  title:     z.string().trim().min(1),
  date:      dateSchema,
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
  date:     dateSchema.optional(),
  schedule: scheduleSchema.nullable().optional(),
  location: z.string().optional(),
  notes:    z.string().optional(),
});
export type UpdateServiceEventInput = z.infer<typeof updateServiceEventInput>;
