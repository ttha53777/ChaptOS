import { z } from "zod";
import { DATE_RE, isValidCalendarDate } from "@/lib/dates";

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

// GET /api/dues. Without a semester, the board covers every live charge.
export const duesBoardQuery = z.object({
  semester: z.string().trim().min(1).max(60).optional(),
});
export type DuesBoardQuery = z.infer<typeof duesBoardQuery>;

// ── Charges ──────────────────────────────────────────────────────────────────
// Dollars on the wire (like every other amount the API takes), at most two
// decimals, converted to integer cents by the service. A line is capped at a
// million dollars so the cents fit the Int column with room to spare.
const MAX_LINE = 1_000_000;
const dollars = z.coerce.number().finite().positive().max(MAX_LINE)
  .refine(n => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "At most two decimal places");
const calendarDate = z.string().regex(DATE_RE).refine(isValidCalendarDate, "Not a real date");
const memberId = z.number().int().positive();

const amount = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("each"),  amount: dollars }),
  z.object({ mode: z.literal("split"), total:  dollars }),
]);

// Who a charge goes to — lib/dues-targets.ts DuesTargetSpec, in dollars.
export const duesAudienceInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all"),  exclude: z.array(memberId).max(2000).default([]), amount }),
  z.object({ kind: z.literal("pick"), brotherIds: z.array(memberId).min(1).max(2000), amount }),
  z.object({
    kind:  z.literal("role"),
    rates: z.array(z.object({
      // A Role id, or "base" (everyone) / "none" (members holding no role).
      key:    z.union([z.number().int().positive(), z.literal("base"), z.literal("none")]),
      amount: dollars,
    })).min(1).max(100)
      .refine(rs => new Set(rs.map(r => r.key)).size === rs.length, "Each rate card row once"),
  }),
]);
export type DuesAudienceInput = z.infer<typeof duesAudienceInput>;

export const issueDuesChargeInput = z.object({
  name:        z.string().trim().min(1, "Give it a name").max(60),
  // Null = no due date: owed, never overdue.
  dueDate:     calendarDate.nullable(),
  note:        z.string().trim().max(500).nullable().optional(),
  audience:    duesAudienceInput,
  // People who already have a live charge of the same name this term.
  onDuplicate: z.enum(["skip", "bill"]).default("skip"),
  // The term it's filed under (a Semester label). Defaults to the active term.
  semester:    z.string().trim().min(1).max(60).optional(),
});
export type IssueDuesChargeInput = z.infer<typeof issueDuesChargeInput>;

export const updateDuesChargeInput = z.object({
  name:    z.string().trim().min(1).max(60).optional(),
  dueDate: calendarDate.nullable().optional(),
  note:    z.string().trim().max(500).nullable().optional(),
}).refine(v => v.name !== undefined || v.dueDate !== undefined || v.note !== undefined, "Nothing to change");
export type UpdateDuesChargeInput = z.infer<typeof updateDuesChargeInput>;

export const waiveDuesInput = z.object({
  brotherId: memberId,
  amount:    dollars,
  reason:    z.string().trim().max(200).nullable().optional(),
  // Pin it to one charge; otherwise it comes off the oldest open line.
  chargeId:  z.number().int().positive().nullable().optional(),
});
export type WaiveDuesInput = z.infer<typeof waiveDuesInput>;
