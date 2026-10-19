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
import { ledgerOwesCents, loadDuesLedger, predatesCutover, writeChargeTx, writeWaiverTx } from "@/lib/dues-ledger-db";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { atLeast, money, toCents } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";
import { DuesAudience, TransactionStatus, TransactionType } from "@/lib/state";
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

/**
 * Change what a member OWES, without any money changing hands.
 *
 * Positive delta charges dues (Spotlight's "charge"); negative waives them.
 *
 * This deliberately writes NO ledger row, and the asymmetry with a dues payment
 * is the accounting principle the whole design rests on: an assessment is a
 * *receivable*, not cash. The ledger records money that actually moved. Booking
 * an assessment as income would inflate the treasury balance with money the
 * chapter does not have.
 *
 * Since dues became charges it also never moves the balance bare: a charge is a
 * one-person "single" charge named after the reason (no due date, so never
 * overdue), and a waiver is a DuesWaiver row. Both go through the same
 * primitives as the Dues tab (lib/dues-ledger-db.ts), so the balance stays equal
 * to what the charges say it is.
 */
export async function adjustDues(ctx: RequestContext, input: AdjustDuesInput) {
  assertCanManageDues(ctx);

  // The roster row for THIS org. A balance is owed to one chapter, so this is
  // the membership, not the account — a member of two chapters carries two
  // independent balances and this may only ever move one of them.
  const member = await ctx.db.member.findRosterRow(input.brotherId);
  if (!member) throw new NotFoundError("Brother");

  const { delta } = input;
  const reason = input.reason?.trim() || null;
  const cents = toCents(Math.abs(delta));
  if (cents === 0) throw new ConflictError("That's less than a cent.");

  let newOwed: number;
  if (delta > 0) {
    const term = await ctx.db.semester.findFirst({ where: { isActive: true }, select: { id: true } });
    await ctx.db.$transaction(tx => writeChargeTx(tx, ctx, {
      name:          (reason ?? "Dues").slice(0, 60),
      dueDate:       null,
      note:          null,
      audienceKind:  DuesAudience.Single,
      audienceLabel: member.name,
      semesterId:    term?.id ?? null,
    }, [{ brotherId: member.id, amountCents: cents }]));
    newOwed = money((await ctx.db.member.findRosterRow(member.id))?.duesOwed ?? 0);
  } else {
    // A waiver can't push the balance below zero — the same compare-and-set
    // guard as a payment, race-safe against a concurrent one, with the same
    // half-cent tolerance (see writeWaiverTx).
    ({ newOwed } = await ctx.db.$transaction(tx => writeWaiverTx(tx, ctx, {
      brotherId: member.id, amountCents: cents, reason, chargeId: null, memberName: member.name, owed: member.duesOwed,
    })));
  }

  await emit(ctx, "dues.adjusted", { type: "Brother", id: member.id }, {
    brotherId: member.id,
    delta,
    reason,
    newOwed,
  });

  return { brotherId: member.id, duesOwed: newOwed };
}

/**
 * Attach an unattributed dues row to the member who actually paid it.
 *
 * A row from before the org started keeping charges (its createdAt predates
 * OrganizationConfig.duesLedgerStartedAt) is pure attribution: it sets brotherId
 * and must NOT touch duesOwed. That balance was already hand-adjusted back when the
 * row was written (the old, broken workflow), and the allocator skips pre-cutover
 * payments — decrementing it again would double-count the payment.
 *
 * A row from after the cutover is different: nothing can hand-adjust a balance any
 * more, so that money never came off anyone's tab. Attributing it makes it a real
 * payment, and it lowers the balance the way recording one would — guarded the same
 * way, so it can't leave a credit.
 */
export async function attributeDuesPayment(ctx: RequestContext, input: AttributeDuesPaymentInput) {
  assertCanManageDues(ctx);

  const member = await ctx.db.member.findByBrotherId(input.brotherId);
  if (!member) throw new NotFoundError("Brother");

  const row = await ctx.db.transaction.findUnique({
    where:  { id: input.transactionId },
    select: { id: true, category: true, type: true, brotherId: true, deletedAt: true, status: true, amount: true, createdAt: true },
  });
  if (!row || row.deletedAt !== null) throw new NotFoundError("Transaction");
  if (row.category !== DUES_CATEGORY || row.type !== TransactionType.Income) {
    throw new ConflictError("Only a dues income row can be attributed to a member.");
  }
  if (row.brotherId !== null) {
    throw new ConflictError("This payment is already attributed.");
  }

  const config = await ctx.db.organizationConfig.find();
  const counts = row.status === TransactionStatus.Posted
    && !predatesCutover(row.createdAt, config?.duesLedgerStartedAt ?? null);

  if (!counts) {
    await ctx.db.transaction.update({
      where: { id: row.id },
      data:  { brotherId: member.brotherId },
    });
  } else {
    const roster = await ctx.db.member.findRosterRow(member.brotherId);
    const orgId = ctx.orgId;
    await ctx.db.$transaction(async (tx) => {
      const claimed = await ctx.db.member.onTx(tx).compareAndSetDues(member.brotherId, {
        guard: { duesOwed: { gte: atLeast(row.amount) } },
        data:  { duesOwed: { decrement: row.amount } },
      });
      if (claimed.count === 0) {
        throw new ConflictError(
          `This $${money(row.amount).toFixed(2)} payment is more than ${roster?.name ?? "they"} owe `
          + `($${money(roster?.duesOwed ?? 0).toFixed(2)}). Charge the difference first.`,
        );
      }
      const linked = await tx.transaction.updateMany({
        where: { id: row.id, organizationId: orgId, brotherId: null, deletedAt: null },
        data:  { brotherId: member.brotherId },
      });
      if (linked.count === 0) throw new ConflictError("This payment is already attributed.");
    });
  }

  await emit(ctx, "dues.payment_attributed", { type: "Transaction", id: row.id }, {
    brotherId:     member.brotherId,
    transactionId: row.id,
  });
}

/**
 * The view whose absence let this bug hide: roster-owed vs ledger-collected, side by
 * side, with the gap stated plainly instead of split across two screens that each
 * claim to be the truth.
 */
export async function getDuesReconciliation(ctx: RequestContext) {
  // listRoster already resolves each member's org-local name, so there is no
  // second name-resolution pass here any more.
  const roster = await ctx.db.member.listRoster();

  const [paidByBrotherId, unattributed, ledger] = await Promise.all([
    sumDuesPaidByBrother(ctx.db, roster.map(b => b.id)),
    // Pre-migration payments: real money, no idea who paid it. Shown, not guessed at.
    ctx.db.transaction.findMany({
      where:   { ...duesPaymentWhere, brotherId: null },
      select:  { id: true, amount: true, date: true, description: true },
      orderBy: { date: "desc" },
    }),
    loadDuesLedger(ctx.db),
  ]);

  // The third book: what the charges say each member owes. `drift` is the stored
  // balance minus that, and every write keeps it at zero (see
  // dues-charge-service) — anything else is a bug to chase, not a number to show.
  const members = roster.map(b => {
    const charged = ledgerOwesCents(ledger, b.id);
    return {
      id:          b.id,
      name:        b.name,
      owed:        money(b.duesOwed),
      paid:        money(paidByBrotherId.get(b.id) ?? 0),
      chargedOwed: charged / 100,
      drift:       (toCents(b.duesOwed) - charged) / 100,
    };
  });

  const rosterOutstanding = money(members.reduce((s, m) => s + m.owed, 0));
  const ledgerCollected   = money(members.reduce((s, m) => s + m.paid, 0));
  const unattributedTotal = money(unattributed.reduce((s, t) => s + t.amount, 0));

  return {
    rosterOutstanding,
    ledgerCollected,
    driftCount: members.filter(m => m.drift !== 0).length,
    unattributedTotal,
    unattributed,
    members,
  };
}
