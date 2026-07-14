/**
 * Dues: the roster balance and the ledger, bound together — behind an approval gate.
 *
 * Brother.duesOwed and the Transaction ledger used to be two books that never met.
 * Admins edited duesOwed as a plain field; dues income lived separately as
 * Transaction rows. Nothing decremented the balance when a payment was recorded,
 * and nothing recorded a payment when the balance was zeroed — so the roster could
 * say everyone was square while the ledger said the chapter had collected nothing,
 * and both numbers were shown to users as fact.
 *
 * The fix is not reconciliation logic bolted on top of two disagreeing books. It is
 * to make it impossible to move one without the other, by deleting every code path
 * that can. But making the two writes atomic also made them instantaneous — anyone
 * who could call the endpoint moved real money the moment they did. DuesPayment adds
 * the missing pause: a payment is *submitted* (a claim, no books touched) and only
 * *approved* later mints the transaction and decrements the balance, atomically, in
 * the same way recordDuesPayment used to do it in one step.
 *
 * There are exactly two ways a balance may move now:
 *
 *   updateDuesPayment(approve) — cash. Mints the income row and decrements the
 *                       balance in ONE DB transaction. The only thing here that
 *                       touches the ledger.
 *   adjustDues        — a receivable. Charges, waivers, corrections. Writes NO ledger
 *                       row, on purpose (see the note on that function).
 *
 * duesOwed is no longer writable through updateBrother. The back doors in
 * transaction-service (voiding or re-pricing a dues row) are guarded there.
 */
import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { DUES_CATEGORY, duesPaymentWhere, sumDuesPaidByBrother } from "@/lib/dues";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { resolveMemberName } from "@/lib/member-names";
import { hasPermission } from "@/lib/permissions";
import { DuesPaymentStatus, TransactionStatus, TransactionType } from "@/lib/state";
import type {
  AdjustDuesInput,
  AttributeDuesPaymentInput,
  SubmitDuesPaymentInput,
  UpdateDuesPaymentInput,
} from "@/lib/validation/dues";

/**
 * Who may move a member's dues balance via an assessment/waiver (adjustDues) or
 * re-attribute a pre-migration ledger row (attributeDuesPayment).
 *
 * Deliberately accepts EITHER treasury or roster authority. The two were in conflict
 * before this change: the treasury page gated its Pay button on MANAGE_TREASURY (and
 * lib/onboarding/perm-areas.ts literally describes that permission as "log dues &
 * payments"), but the endpoint it called required MANAGE_BROTHERS — so a treasurer
 * without MANAGE_BROTHERS got a 403 that the optimistic client silently reverted, with
 * no error shown. Accepting either resolves that without regressing anyone's access.
 */
function assertCanManageDues(ctx: RequestContext): void {
  const allowed = ctx.isPlatformAdmin
    || ctx.isOrgAdmin
    || hasPermission(ctx.permissions, "MANAGE_TREASURY")
    || hasPermission(ctx.permissions, "MANAGE_BROTHERS");
  if (!allowed) throw new ForbiddenError("Cannot record or adjust dues");
}

/**
 * Who may submit or approve a dues *payment* specifically — narrower than
 * assertCanManageDues on purpose. Submitting and approving are the two halves of real
 * money movement, so both require treasury authority; MANAGE_BROTHERS alone (roster
 * management, no financial authority) is not enough here even though it is for
 * assessments/waivers.
 */
function assertCanApproveDuesPayments(ctx: RequestContext): void {
  const allowed = ctx.isPlatformAdmin
    || ctx.isOrgAdmin
    || hasPermission(ctx.permissions, "MANAGE_TREASURY");
  if (!allowed) throw new ForbiddenError("Cannot submit or approve dues payments");
}

/** Two decimal places. Float dollars drift under repeated arithmetic; money reads shouldn't. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

const DUES_PAYMENT_INCLUDE = {
  brother: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.DuesPaymentInclude;

type DuesPaymentRow = Prisma.DuesPaymentGetPayload<{ include: typeof DUES_PAYMENT_INCLUDE }>;

// amountCents is a BigInt and BigInt is not JSON-serializable — Response.json() throws
// on it. Strip it, exactly like transaction-service's mapTx / reimbursement-service's
// mapReimbursement.
function mapDuesPayment<T extends { amountCents: bigint | null }>(raw: T): Omit<T, "amountCents"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { amountCents, ...rest } = raw;
  return rest;
}

// Org-local display name (Membership.name), same fallback rule as the roster —
// otherwise a member who renamed themselves in this org would show a stale name on
// their own dues payment requests.
async function withResolvedBrother(ctx: RequestContext, rows: DuesPaymentRow[]): Promise<DuesPaymentRow[]> {
  const brothers = rows.map(r => r.brother).filter((b): b is NonNullable<DuesPaymentRow["brother"]> => b != null);
  if (brothers.length === 0) return rows;
  const nameByBrotherId = await ctx.db.membership.resolveNames(brothers);
  return rows.map(r => r.brother
    ? { ...r, brother: { ...r.brother, name: nameByBrotherId.get(r.brother.id) ?? r.brother.name } }
    : r);
}

/** The pending-approval queue plus history — the UI filters by status client-side. */
export async function listDuesPayments(ctx: RequestContext) {
  const rows = await ctx.db.duesPayment.findMany({
    orderBy: { createdAt: "desc" },
    include: DUES_PAYMENT_INCLUDE,
  }) as DuesPaymentRow[];
  const resolved = await withResolvedBrother(ctx, rows);
  return resolved.map(mapDuesPayment);
}

/**
 * Submit a dues payment: stage the claim, touch nothing else. No balance check, no
 * ledger row — mirrors createReimbursement, which does no financial validation at
 * creation time either. Two pending requests may coexist against one balance; only
 * one can win when someone approves (see updateDuesPayment).
 */
export async function submitDuesPayment(ctx: RequestContext, input: SubmitDuesPaymentInput) {
  assertCanApproveDuesPayments(ctx);

  // Org-scoped read: this IS the tenancy guard for the brotherId — a cross-tenant id
  // resolves to null through the wrapper.
  const brother = await ctx.db.brother.findUnique({
    where:  { id: input.brotherId },
    select: { id: true },
  });
  if (!brother) throw new NotFoundError("Brother");

  const row = await ctx.db.duesPayment.create({
    data: {
      brotherId:     brother.id,
      amount:        input.amount,
      amountCents:   BigInt(Math.round(input.amount * 100)),
      date:          input.date,
      paymentMethod: input.paymentMethod ?? null,
    },
    include: DUES_PAYMENT_INCLUDE,
  }) as DuesPaymentRow;

  await emit(ctx, "dues_payment.submitted", { type: "DuesPayment", id: row.id }, {
    brotherId: row.brotherId,
    amount:    row.amount,
    date:      row.date,
  });

  const [resolved] = await withResolvedBrother(ctx, [row]);
  return mapDuesPayment(resolved);
}

/**
 * Approve or reject a pending dues payment. Approval is the moment a claim becomes
 * money movement, so it mints the income row and decrements duesOwed atomically —
 * the same guarantee recordDuesPayment used to make in a single call, now made at
 * approval time instead of submission time. Rejection touches neither book: nothing
 * was ever written to them, so there is nothing to undo.
 */
export async function updateDuesPayment(ctx: RequestContext, id: number, input: UpdateDuesPaymentInput) {
  assertCanApproveDuesPayments(ctx);

  // Org-scoped read: also pre-verifies the id is in this org, which the raw tx
  // client below can't do for itself (see lib/db/tenant.ts).
  const existing = await ctx.db.duesPayment.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("DuesPayment");

  // A decided request can't be re-decided. Unlike Reimbursement, there is no
  // reversal path here — approving moves real money, so "approve, then un-approve"
  // is not offered; voiding a posted dues payment goes through the existing
  // transaction-service softDeleteTransaction path instead.
  if (existing.status !== DuesPaymentStatus.Pending) {
    throw new ConflictError(`This dues payment has already been ${existing.status}.`);
  }

  if (input.status === DuesPaymentStatus.Rejected) {
    const row = await ctx.db.duesPayment.update({
      where: { id },
      data: {
        status:        DuesPaymentStatus.Rejected,
        rejectionNote: input.rejectionNote ?? null,
      },
      include: DUES_PAYMENT_INCLUDE,
    }) as DuesPaymentRow;

    await emit(ctx, "dues_payment.rejected", { type: "DuesPayment", id: row.id }, {
      brotherId:     row.brotherId,
      amount:        row.amount,
      rejectionNote: row.rejectionNote,
    });

    const [resolved] = await withResolvedBrother(ctx, [row]);
    return mapDuesPayment(resolved);
  }

  // Approving. Read the brother's current balance and the org-local payee name
  // before opening the transaction — plain lookups, held as briefly as possible.
  const brother = await ctx.db.brother.findUnique({
    where:  { id: existing.brotherId },
    select: { id: true, name: true, duesOwed: true },
  });
  if (!brother) throw new NotFoundError("Brother");
  const payee = await resolveMemberName(ctx.db, brother.id) ?? brother.name;

  // Budget spend matches expenses on the semester *label*, not semesterId, so a row
  // without one is invisible to the budget page even with the right category.
  const semester = await ctx.db.semester.findFirst({
    where:  { isActive: true },
    select: { id: true, label: true },
  });

  const { amount } = existing;
  const orgId = ctx.orgId;

  const { transaction, remainingOwed } = await ctx.db.$transaction(async (tx) => {
    // Compare-and-set against a concurrent second approval (or a reject that raced
    // in). Only one caller can flip this row out of "pending".
    const claimedRequest = await tx.duesPayment.updateMany({
      where: { id, organizationId: orgId, status: DuesPaymentStatus.Pending },
      data:  { status: DuesPaymentStatus.Approved },
    });
    if (claimedRequest.count === 0) {
      throw new ConflictError("This dues payment has already been decided.");
    }

    // Same compare-and-set recordDuesPayment used to run inline: the balance
    // predicate lives in the WHERE clause, not a read-then-write, so it is doing
    // three jobs at once — atomic decrement, refusing overpayment, and making a
    // concurrent double-approve of two DIFFERENT pending requests against the same
    // balance safe (the loser's updateMany matches zero rows and 409s, rolling back
    // the status flip above too since both run in this one transaction).
    const claimedBrother = await tx.brother.updateMany({
      where: { id: brother.id, organizationId: orgId, duesOwed: { gte: amount } },
      data:  { duesOwed: { decrement: amount } },
    });
    if (claimedBrother.count === 0) {
      throw new ConflictError(
        `Payment of $${money(amount).toFixed(2)} exceeds ${payee}'s outstanding balance of `
        + `$${money(brother.duesOwed).toFixed(2)}.`,
      );
    }

    // The tx client is raw and NOT org-scoped, so every write inside carries
    // organizationId explicitly (the house pattern — see reimbursement-service.ts).
    const transaction = await tx.transaction.create({
      data: {
        organizationId: orgId,
        type:          TransactionType.Income,
        category:      DUES_CATEGORY,   // the STORED category — never the vocab label
        brotherId:     brother.id,
        amount,
        amountCents:   existing.amountCents ?? BigInt(Math.round(amount * 100)),
        date:          existing.date,
        description:   `Dues payment — ${payee}`,
        paymentMethod: existing.paymentMethod,
        status:        TransactionStatus.Posted,
        semester:      semester?.label ?? null,
        semesterId:    semester?.id    ?? null,
      },
    });

    await tx.duesPayment.update({
      where: { id },
      data:  { transactionId: transaction.id },
    });

    // Read back inside the tx rather than computing owed − amount in JS: the row we
    // just decremented is the authority.
    const updated = await tx.brother.findUnique({
      where:  { id: brother.id },
      select: { duesOwed: true },
    });

    return { transaction, remainingOwed: money(updated?.duesOwed ?? 0) };
  });

  // Emit after commit: emit() writes through the raw prisma singleton and swallows its
  // own errors, so it neither joins nor rolls back the transaction above. Same action
  // and payload shape recordDuesPayment used to emit — it still means "money moved",
  // just triggered by approval instead of by a single call.
  await emit(ctx, "dues.paid", { type: "Transaction", id: transaction.id }, {
    brotherId:     brother.id,
    amount:        transaction.amount,
    transactionId: transaction.id,
    remainingOwed,
  });

  const row = await ctx.db.duesPayment.findUnique({ where: { id }, include: DUES_PAYMENT_INCLUDE }) as DuesPaymentRow;
  const [resolved] = await withResolvedBrother(ctx, [row]);
  return mapDuesPayment(resolved);
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
