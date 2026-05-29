import { z } from "zod";
import { PARTY_TYPES } from "@/lib/state";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
}).refine(d => !d.completed || (d.doorRevenue !== undefined && d.attendance !== undefined && d.expenses !== undefined), {
  message: "Revenue, expenses, and attendance are required to complete a party",
  path: ["completed"],
});
export type UpdatePartyInput = z.infer<typeof updatePartyInput>;
