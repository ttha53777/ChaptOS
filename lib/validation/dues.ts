import { z } from "zod";
import { DATE_RE } from "@/lib/dates";

const MAX_AMOUNT = 1_000_000_000;

// A dues payment is recorded by posting an income transaction (see createTransaction),
// so its shape lives in lib/validation/transaction.ts (a "Dues" income row with a
// brotherId). This module now owns only the balance-adjustment inputs below.

// A signed delta, not an absolute balance. Setting the balance directly is the
// very thing that let the roster and the ledger drift apart — an overwrite says
// nothing about what changed or why, so it can't be audited or reversed. A delta
// can: positive charges dues, negative waives or corrects them.
const adjustment = z.coerce.number().finite().max(MAX_AMOUNT).min(-MAX_AMOUNT)
  .refine(n => n !== 0, "delta must be non-zero");

export const adjustDuesInput = z.object({
  brotherId: z.number().int().positive(),
  delta:     adjustment,
  reason:    z.string().max(200).optional().nullable(),
});
export type AdjustDuesInput = z.infer<typeof adjustDuesInput>;

// Attaching a pre-migration dues row to the member who actually paid it. Pure
// attribution: it sets Transaction.brotherId and must NOT touch duesOwed, because
// that balance was already hand-adjusted back when the row was written.
export const attributeDuesPaymentInput = z.object({
  transactionId: z.number().int().positive(),
  brotherId:     z.number().int().positive(),
});
export type AttributeDuesPaymentInput = z.infer<typeof attributeDuesPaymentInput>;
