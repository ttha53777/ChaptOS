import { z } from "zod";
import { dateSchema, zoneSchema } from "@/lib/calendar-feed/schedule";
import { FUNDRAISER_KINDS_LIST } from "@/lib/state/fundraiser-kind";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
// Dollars from a money field. Two decimals at most; the service stores cents.
const dollars = z.number().finite().min(0).max(1_000_000);

export const createFundraiserInput = z.object({
  name:      z.string().trim().min(1).max(120),
  date:      dateSchema,
  startTime: clock.nullable().optional(),
  endTime:   clock.nullable().optional(),
  /** The browser's IANA zone; needed only when a start time is given. */
  timeZone:  zoneSchema.optional(),
  place:     z.string().trim().max(200).nullable().optional(),
  goal:      dollars.positive().nullable().optional(),
  kind:      z.enum(FUNDRAISER_KINDS_LIST as [string, ...string[]]).optional(),
}).refine(v => !v.endTime || !!v.startTime, { message: "Add a start time first", path: ["endTime"] })
  .refine(v => !v.startTime || !v.endTime || v.endTime > v.startTime, { message: "End must be after start", path: ["endTime"] });
export type CreateFundraiserInput = z.infer<typeof createFundraiserInput>;

export const updateFundraiserInput = z.object({
  name:      z.string().trim().min(1).max(120).optional(),
  date:      dateSchema.optional(),
  startTime: clock.nullable().optional(),
  endTime:   clock.nullable().optional(),
  timeZone:  zoneSchema.optional(),
  place:     z.string().trim().max(200).nullable().optional(),
  goal:      dollars.positive().nullable().optional(),
  kind:      z.enum(FUNDRAISER_KINDS_LIST as [string, ...string[]]).optional(),
});
export type UpdateFundraiserInput = z.infer<typeof updateFundraiserInput>;

export const addSupplyInput = z.object({
  name: z.string().trim().min(1).max(120),
  cost: dollars.default(0),
});
export type AddSupplyInput = z.infer<typeof addSupplyInput>;

export const updateSupplyInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  cost: dollars.optional(),
});
export type UpdateSupplyInput = z.infer<typeof updateSupplyInput>;

export const wrapFundraiserInput = z.object({
  cameIn: dollars,
});
export type WrapFundraiserInput = z.infer<typeof wrapFundraiserInput>;
