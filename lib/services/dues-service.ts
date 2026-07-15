/**
 * Dues: the roster balance and the ledger, bound together.
 *
 * Brother.duesOwed and the Transaction ledger used to be two books that never met.
 * Admins edited duesOwed as a plain field; dues income lived separately as
 * Transaction rows. Nothing decremented the balance when a payment was recorded,
 * and nothing recorded a payment when the balance was zeroed — so the roster could
 * say everyone was square while the ledger said the chapter had collected nothing.
 *
 * The fix is to make it impossible to move one without the other. There are exactly
 * two ways a balance may move now:
 *
 *   recordDuesPayment — cash. Lives in transaction-service.createTransaction: a treasurer
 *                       posts the "Dues" income row through the ordinary (pre-filled)
 *                       transaction form, and the same DB transaction that mints it
 *                       decrements the balance. The only thing that touches the ledger.
 *   adjustDues        — a receivable. Charges, waivers, corrections. Writes NO ledger
 *                       row, on purpose (see the note on that function).
 *
 * duesOwed is no longer writable through updateBrother. The back door in
 * transaction-service (voiding or re-pricing a dues row) is guarded there — voiding a
 * dues payment re-increments the balance, the mirror of recording it.
 *
 * Everything here is treasury-only: recording a payment is MANAGE_TREASURY-gated at the
 * transactions route, and these balance controls match it (assertCanManageDues).
 */
import type { RequestContext } from "@/lib/context";
import { DUES_CATEGORY, duesPaymentWhere, sumDuesPaidByBrother } from "@/lib/dues";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { hasPermission } from "@/lib/permissions";
import { TransactionType } from "@/lib/state";
import type {
  AdjustDuesInput,
  AttributeDuesPaymentInput,
} from "@/lib/validation/dues";

/**
 * Who may touch dues: assess/waive a receivable (adjustDues) or re-attribute a
 * pre-migration ledger row (attributeDuesPayment).
 *
 * Treasury-only. Recording a payment moves real money and goes through the
 * MANAGE_TREASURY-gated transactions route; these balance controls match it so client
 * and server agree (every dues control in the UI also gates on MANAGE_TREASURY). This is
 * deliberately narrower than the old rule, which also accepted MANAGE_BROTHERS — that
 * only existed to paper over a page/endpoint permission mismatch that no longer exists.
 */
function assertCanManageDues(ctx: RequestContext): void {
  const allowed = ctx.isPlatformAdmin
    || ctx.isOrgAdmin
    || hasPermission(ctx.permissions, "MANAGE_TREASURY");
  if (!allowed) throw new ForbiddenError("Cannot record or adjust dues");
}

/** Two decimal places. Float dollars drift under repeated arithmetic; money reads shouldn't. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Change what a member OWES, without any money changing hands.
 *
 * Positive delta charges dues (the treasury "+ Add"); negative waives or corrects them.
 *
 * This deliberately writes NO ledger row, and the asymmetry with an approved
 * DuesPayment is the accounting principle the whole design rests on: an assessment is
 * a *receivable*, not cash. The ledger records money that actually moved. Booking an
 * assessment as income would inflate the treasury balance with money the chapter does
 * not have.
 *
 * It is also what replaces duesOwed-as-free-text: admins keep the ability to correct a
 * balance, but it becomes an auditable, reasoned adjustment rather than an anonymous
 * overwrite.
 */
export async function adjustDues(ctx: RequestContext, input: AdjustDuesInput) {
  assertCanManageDues(ctx);

  const brother = await ctx.db.brother.findUnique({
    where:  { id: input.brotherId },
    select: { id: true, name: true, duesOwed: true },
  });
  if (!brother) throw new NotFoundError("Brother");

  const { delta } = input;

  // A waiver can't push the balance below zero — the same compare-and-set guard as a
  // payment, for the same reason (and it's race-safe against a concurrent payment).
  // ctx.db.brother.updateMany is org-scoped, so the org filter is injected for us.
  const guard = delta < 0 ? { duesOwed: { gte: -delta } } : {};

  const claimed = await ctx.db.brother.updateMany({
    where: { id: brother.id, ...guard },
    data:  { duesOwed: { increment: delta } },
  });
  if (claimed.count === 0) {
    throw new ConflictError(
      `Cannot reduce ${brother.name}'s dues by $${money(-delta).toFixed(2)} — they owe `
      + `$${money(brother.duesOwed).toFixed(2)}.`,
    );
  }

  const updated = await ctx.db.brother.findUnique({
    where:  { id: brother.id },
    select: { duesOwed: true },
  });
  const newOwed = money(updated?.duesOwed ?? 0);

  await emit(ctx, "dues.adjusted", { type: "Brother", id: brother.id }, {
    brotherId: brother.id,
    delta,
    reason:    input.reason ?? null,
    newOwed,
  });

  return { brotherId: brother.id, duesOwed: newOwed };
}

/**
 * Attach a pre-migration dues row to the member who actually paid it.
 *
 * Pure attribution: it sets brotherId and must NOT touch duesOwed. That balance was
 * already hand-adjusted back when the row was written (that was the old, broken
 * workflow) — decrementing it again here would double-count the payment and take the
 * member's balance below what they really owe.
 */
export async function attributeDuesPayment(ctx: RequestContext, input: AttributeDuesPaymentInput) {
  assertCanManageDues(ctx);

  const brother = await ctx.db.brother.findUnique({
    where:  { id: input.brotherId },
    select: { id: true },
  });
  if (!brother) throw new NotFoundError("Brother");

  const row = await ctx.db.transaction.findUnique({
    where:  { id: input.transactionId },
    select: { id: true, category: true, type: true, brotherId: true, deletedAt: true },
  });
  if (!row || row.deletedAt !== null) throw new NotFoundError("Transaction");
  if (row.category !== DUES_CATEGORY || row.type !== TransactionType.Income) {
    throw new ConflictError("Only a dues income row can be attributed to a member.");
  }
  if (row.brotherId !== null) {
    throw new ConflictError("This payment is already attributed.");
  }

  await ctx.db.transaction.update({
    where: { id: row.id },
    data:  { brotherId: brother.id },
  });

  await emit(ctx, "dues.payment_attributed", { type: "Transaction", id: row.id }, {
    brotherId:     brother.id,
    transactionId: row.id,
  });
}

/**
 * The view whose absence let this bug hide: roster-owed vs ledger-collected, side by
 * side, with the gap stated plainly instead of split across two screens that each
 * claim to be the truth.
 */
export async function getDuesReconciliation(ctx: RequestContext) {
  const brothers = await ctx.db.brother.findMany({
    where:  { isGhost: false },
    select: { id: true, name: true, duesOwed: true },
    orderBy: { id: "asc" },
  });

  const [paidByBrotherId, nameByBrotherId, unattributed] = await Promise.all([
    sumDuesPaidByBrother(ctx.db, brothers.map(b => b.id)),
    ctx.db.membership.resolveNames(brothers),
    // Pre-migration payments: real money, no idea who paid it. Shown, not guessed at.
    ctx.db.transaction.findMany({
      where:   { ...duesPaymentWhere, brotherId: null },
      select:  { id: true, amount: true, date: true, description: true },
      orderBy: { date: "desc" },
    }),
  ]);

  const members = brothers.map(b => ({
    id:       b.id,
    name:     nameByBrotherId.get(b.id) ?? b.name,
    owed:     money(b.duesOwed),
    paid:     money(paidByBrotherId.get(b.id) ?? 0),
  }));

  const rosterOutstanding = money(members.reduce((s, m) => s + m.owed, 0));
  const ledgerCollected   = money(members.reduce((s, m) => s + m.paid, 0));
  const unattributedTotal = money(unattributed.reduce((s, t) => s + t.amount, 0));

  return {
    rosterOutstanding,
    ledgerCollected,
    unattributedTotal,
    unattributed,
    members,
  };
}
