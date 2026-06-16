import { z } from "zod";
import { PARTY_TYPES } from "@/lib/state";
import { DATE_RE } from "@/lib/dates";

export const createPartyInput = z.object({
  name:        z.string().trim().min(1),
  date:        z.string().regex(DATE_RE),
  partyType:   z.enum(PARTY_TYPES as readonly [string, ...string[]]).optional(),
  theme:       z.string().optional(),
  collabOrg:   z.string().optional(),
  doorRevenue: z.coerce.number().nonnegative().default(0),
  attendance:  z.coerce.number().nonnegative().default(0),
  expenses:    z.coerce.number().nonnegative().default(0),
  notes:       z.string().optional(),
});
export type CreatePartyInput = z.infer<typeof createPartyInput>;

export const updatePartyInput = z.object({
  name:        z.string().min(1).optional(),
  date:        z.string().regex(DATE_RE).optional(),
  partyType:   z.enum(PARTY_TYPES as readonly [string, ...string[]]).optional(),
  theme:       z.string().optional(),
  collabOrg:   z.string().optional(),
  doorRevenue: z.coerce.number().nonnegative().optional(),
  attendance:  z.coerce.number().nonnegative().optional(),
  expenses:    z.coerce.number().nonnegative().optional(),
  notes:       z.string().optional(),
  completed:   z.boolean().optional(),
}).refine(d => !d.completed || (d.doorRevenue !== undefined && d.expenses !== undefined), {
  message: "Revenue and expenses are required to complete a party",
  path: ["completed"],
});
export type UpdatePartyInput = z.infer<typeof updatePartyInput>;

// Wrap-up = mark a party completed AND (optionally) record member roll in one call.
// `attendedIds` present → take roll on a backing calendar event. `mandatory` decides
// whether that roll counts toward the chapter-wide attendance %. Omitting attendedIds
// wraps up money-only (no roll).
export const wrapUpPartyInput = z.object({
  doorRevenue: z.coerce.number().nonnegative(),
  expenses:    z.coerce.number().nonnegative(),
  notes:       z.string().optional(),
  attendedIds: z.array(z.number().int().positive()).optional(),
  mandatory:   z.boolean().optional().default(false),
});
export type WrapUpPartyInput = z.infer<typeof wrapUpPartyInput>;
