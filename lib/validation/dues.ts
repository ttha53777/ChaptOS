import { z } from "zod";
import { DATE_RE } from "@/lib/dates";
import { DUES_PAYMENT_STATUSES } from "@/lib/state";

const MAX_AMOUNT = 1_000_000_000;

// A payment is `positive`, not `nonnegative`: submitting a $0 payment would mint a
// meaningless ledger row and move no balance. `.finite()` guards the
// BigInt(Math.round(x * 100)) conversion downstream.
const paymentAmount = z.coerce.number().finite().positive().max(MAX_AMOUNT);

// Submitting a payment only stages it — see submitDuesPayment in
// lib/services/dues-service.ts. Nothing here moves duesOwed or mints a ledger row;
// that happens only when the request is later approved via updateDuesPaymentInput.
export const submitDuesPaymentInput = z.object({
  brotherId:     z.number().int().positive(),
  amount:        paymentAmount,
  date:          z.string().regex(DATE_RE, "date must use YYYY-MM-DD format"),
  paymentMethod: z.string().max(100).optional().nullable(),
});
export type SubmitDuesPaymentInput = z.infer<typeof submitDuesPaymentInput>;

// Approving or rejecting a pending request. Approval is the only path that mints a
// ledger row and decrements duesOwed; rejection is a pure status flip (see
// updateDuesPayment).
export const updateDuesPaymentInput = z.object({
  status:        z.enum(DUES_PAYMENT_STATUSES as readonly [string, ...string[]]),
  rejectionNote: z.string().max(500).optional().nullable(),
});
export type UpdateDuesPaymentInput = z.infer<typeof updateDuesPaymentInput>;

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
