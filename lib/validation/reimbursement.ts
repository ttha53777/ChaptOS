import { z } from "zod";
import { DATE_RE } from "@/lib/dates";
import { REIMBURSEMENT_STATUSES } from "@/lib/state";

const money = z.coerce.number().finite().nonnegative().max(1_000_000_000);

export const createReimbursementInput = z.object({
  brotherId:   z.number().int().positive(),
  amount:      money,
  date:        z.string().regex(DATE_RE),
  description: z.string().min(1).max(500),
});
export type CreateReimbursementInput = z.infer<typeof createReimbursementInput>;

export const updateReimbursementInput = z.object({
  status:        z.enum(REIMBURSEMENT_STATUSES as readonly [string, ...string[]]).optional(),
  rejectionNote: z.string().max(500).optional().nullable(),
});
export type UpdateReimbursementInput = z.infer<typeof updateReimbursementInput>;
