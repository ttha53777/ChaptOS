import { z } from "zod";
import { DATE_RE } from "@/lib/dates";
import { REIMBURSEMENT_STATUSES } from "@/lib/state";

const money = z.coerce.number().finite().nonnegative().max(1_000_000_000);

// The budget bucket this spend belongs to. Free text rather than an enum: budget
// allocations are per-org, user-named categories (BudgetAllocation.category), so
// there is no fixed list to validate against.
const category = z.string().min(1).max(100);

export const createReimbursementInput = z.object({
  brotherId:   z.number().int().positive(),
  amount:      money,
  date:        z.string().regex(DATE_RE),
  description: z.string().min(1).max(500),
  category:    category.optional().nullable(),
});
export type CreateReimbursementInput = z.infer<typeof createReimbursementInput>;

export const updateReimbursementInput = z.object({
  status:        z.enum(REIMBURSEMENT_STATUSES as readonly [string, ...string[]]).optional(),
  rejectionNote: z.string().max(500).optional().nullable(),
  // The treasurer can correct the bucket at approval time — which is also what
  // makes the field usable when the requester left it blank.
  category:      category.optional().nullable(),
});
export type UpdateReimbursementInput = z.infer<typeof updateReimbursementInput>;
