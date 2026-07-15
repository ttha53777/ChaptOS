import type { RequestContext } from "@/lib/context";
import { DUES_CATEGORY } from "@/lib/dues";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { TransactionStatus, TransactionType } from "@/lib/state";
import type { CreateTransactionInput, UpdateTransactionInput } from "@/lib/validation/transaction";

export interface TxFilter {
  type?: string;
  semester?: string;
  category?: string;
  calendarEventId?: number;
}

type LinkedEvent = { id: number; title: string; date: string; category: string };

const EVENT_INCLUDE = {
  calendarEvents: {
    include: {
      calendarEvent: { select: { id: true, title: true, date: true, category: true } },
    },
  },
} as const;

type RawWithEvents = {
  amountCents: bigint | null;
  calendarEvents: { calendarEvent: LinkedEvent }[];
  [key: string]: unknown;
};

function mapTx(raw: RawWithEvents) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { amountCents, calendarEvents, ...rest } = raw;
  return { ...rest, calendarEvents: calendarEvents.map(l => l.calendarEvent) };
}

/**
 * Is this row a dues payment that a member's balance is counting on?
 *
 * These rows are half of an invariant: Brother.duesOwed was decremented in the same DB
 * transaction that minted them (see recordDuesPayment below). Editing or deleting one of
 * these rows without also touching the balance puts the two books right back out of step,
 * which is the exact drift this whole design closes. So this predicate gates all three:
 * the dues-aware create, the update guard, and the void restore.
 */
function isDuesPayment(row: { brotherId: number | null; category: string; type: string }): boolean {
  return row.brotherId !== null
    && row.category === DUES_CATEGORY
    && row.type === TransactionType.Income;
}

async function validateEventIds(ctx: RequestContext, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await ctx.db.calendarEvent.findMany({
    where: { id: { in: ids }, organizationId: ctx.orgId },
    select: { id: true },
  });
  if (found.length !== ids.length) throw new NotFoundError("CalendarEvent");
}

export async function listTransactions(ctx: RequestContext, filter: TxFilter = {}) {
  const rows = await ctx.db.transaction.findMany({
    where: {
      deletedAt: null,
      ...(filter.type     ? { type: filter.type }         : {}),
      ...(filter.semester ? { semester: filter.semester } : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.calendarEventId
        ? { calendarEvents: { some: { calendarEventId: filter.calendarEventId } } }
        : {}),
    },
    include: EVENT_INCLUDE,
    orderBy: { date: "desc" },
  });
  return rows.map(r => mapTx(r as unknown as RawWithEvents));
}

/** Two decimal places. Float dollars drift under repeated arithmetic; money reads shouldn't. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function createTransaction(ctx: RequestContext, input: CreateTransactionInput) {
  const ids = input.calendarEventIds ?? [];
  await validateEventIds(ctx, ids);

  const brotherId = input.brotherId ?? null;

  // A dues payment is the one transaction that also moves a member's balance. Mint the
  // income row and decrement Brother.duesOwed in ONE DB transaction — the exact mirror of
  // softDeleteTransaction, which re-increments it when a dues row is voided. Any other
  // transaction (including an *unattributed* "Dues" income row, brotherId null) takes the
  // plain path below and touches no balance.
  if (isDuesPayment({ brotherId, category: input.category, type: input.type })) {
    return recordDuesPayment(ctx, input, brotherId!, ids);
  }

  const raw = await ctx.db.transaction.create({
    data: {
      type:          input.type,
      category:      input.category,
      amount:        input.amount,
      amountCents:   BigInt(Math.round(input.amount * 100)),
      date:          input.date,
      description:   input.description,
      paymentMethod: input.paymentMethod ?? null,
      semester:      input.semester      ?? null,
      status:        input.status        ?? "posted",
      calendarEvents: ids.length > 0
        ? { create: ids.map(id => ({ calendarEventId: id })) }
        : undefined,
    },
    include: EVENT_INCLUDE,
  });

  const tx = mapTx(raw as unknown as RawWithEvents);
  await emit(ctx, "transaction.created", { type: "Transaction", id: raw.id }, {
    type:        raw.type as "income" | "expense",
    category:    raw.category,
    amount:      raw.amount,
    description: raw.description,
  });
  return tx;
}

/**
 * Record a dues payment: mint the income row and decrement the member's balance in one
 * DB transaction, refusing overpayment. This is the single place a dues payment moves
 * both books — the same guarantee recordDuesPayment made before the short-lived
 * submit/approve split, now reached straight from createTransaction so a treasurer posts
 * it through the ordinary transaction form (pre-filled) instead of an approval queue.
 */
async function recordDuesPayment(
  ctx: RequestContext,
  input: CreateTransactionInput,
  brotherId: number,
  eventIds: number[],
) {
  // Org-scoped read: the tenancy guard for brotherId (a cross-tenant id resolves to null
  // through the wrapper) AND the current balance the decrement is checked against. The
  // raw tx client used inside $transaction below is NOT org-scoped and can do neither.
  const brother = await ctx.db.brother.findUnique({
    where:  { id: brotherId },
    select: { id: true, name: true, duesOwed: true },
  });
  if (!brother) throw new NotFoundError("Brother");

  // Budget spend matches expenses on the semester *label*, not semesterId, so carry both
  // — a row without a label is invisible to the budget page even with the right category.
  const semester = await ctx.db.semester.findFirst({
    where:  { isActive: true },
    select: { id: true, label: true },
  });

  const { amount } = input;
  const orgId = ctx.orgId;

  const { raw, remainingOwed } = await ctx.db.$transaction(async (tx) => {
    // Compare-and-set: atomic decrement, refusal of overpayment, and safety against a
    // concurrent second payment against the same balance, all in the WHERE clause — the
    // loser matches zero rows and 409s, rolling back the (as-yet-unwritten) income row.
    const claimed = await tx.brother.updateMany({
      where: { id: brotherId, organizationId: orgId, duesOwed: { gte: amount } },
      data:  { duesOwed: { decrement: amount } },
    });
    if (claimed.count === 0) {
      throw new ConflictError(
        `Payment of $${money(amount).toFixed(2)} exceeds ${brother.name}'s outstanding `
        + `balance of $${money(brother.duesOwed).toFixed(2)}.`,
      );
    }

    // The tx client is raw and NOT org-scoped, so this write carries organizationId
    // explicitly (the house pattern — see reimbursement-service.ts / dues-service.ts).
    const raw = await tx.transaction.create({
      data: {
        organizationId: orgId,
        type:          TransactionType.Income,
        category:      DUES_CATEGORY,   // the STORED category — never the vocab label
        brotherId,
        amount,
        amountCents:   BigInt(Math.round(amount * 100)),
        date:          input.date,
        description:   input.description,
        paymentMethod: input.paymentMethod ?? null,
        status:        TransactionStatus.Posted,
        semester:      semester?.label ?? null,
        semesterId:    semester?.id    ?? null,
        calendarEvents: eventIds.length > 0
          ? { create: eventIds.map(id => ({ calendarEventId: id })) }
          : undefined,
      },
      include: EVENT_INCLUDE,
    });

    // Read back inside the tx: the row we just decremented is the authority.
    const updated = await tx.brother.findUnique({
      where:  { id: brotherId },
      select: { duesOwed: true },
    });
    return { raw, remainingOwed: money(updated?.duesOwed ?? 0) };
  });

  const tx = mapTx(raw as unknown as RawWithEvents);
  // Emit after commit, same action and shape the approval step used to emit — it still
  // means "money moved", just triggered by posting the transaction directly.
  await emit(ctx, "dues.paid", { type: "Transaction", id: raw.id }, {
    brotherId,
    amount:        raw.amount,
    transactionId: raw.id,
    remainingOwed,
  });
  return tx;
}

export async function updateTransaction(ctx: RequestContext, id: number, input: UpdateTransactionInput) {
  const { calendarEventIds, ...scalarInput } = input;

  if (calendarEventIds !== undefined) {
    await validateEventIds(ctx, calendarEventIds);
  }

  // Guard the dues invariant. A dues row's amount is mirrored in Brother.duesOwed, and
  // its category is what every dues aggregation matches on:
  //   - re-pricing it here would leave the ledger and the roster disagreeing by exactly
  //     the difference;
  //   - re-bucketing it out of "Dues" would make the payment vanish from every dues
  //     total while the member stays credited for it.
  // Neither has a safe silent answer, so refuse and point at the one that does. Voiding
  // restores the balance (softDeleteTransaction, below); re-recording re-decrements it.
  const existing = await ctx.db.transaction.findUnique({
    where:  { id },
    select: { id: true, brotherId: true, category: true, type: true },
  });
  if (!existing) throw new NotFoundError("Transaction");

  if (isDuesPayment(existing)) {
    const desyncing = (["amount", "category", "type"] as const)
      .filter(k => scalarInput[k] !== undefined && scalarInput[k] !== existing[k]);
    if (desyncing.length > 0) {
      throw new ConflictError(
        `Cannot change the ${desyncing.join(" or ")} of a dues payment — a member's balance `
        + `depends on it. Void this payment and record it again instead.`,
      );
    }
  }

  const scalarData: Record<string, unknown> = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(scalarInput) as (keyof typeof scalarInput)[]) {
    const v = scalarInput[k];
    if (v === undefined) continue;
    scalarData[k] = v;
    changedFields.push(k);
    if (k === "amount" && typeof v === "number") {
      scalarData.amountCents = BigInt(Math.round(v * 100));
      changedFields.push("amountCents");
    }
  }

  if (calendarEventIds !== undefined) changedFields.push("calendarEventIds");

  const raw = await ctx.db.transaction.update({
    where: { id },
    data: {
      ...scalarData,
      ...(calendarEventIds !== undefined ? {
        calendarEvents: {
          deleteMany: {},
          create: calendarEventIds.map(eid => ({ calendarEventId: eid })),
        },
      } : {}),
    },
    include: EVENT_INCLUDE,
  });

  const tx = mapTx(raw as unknown as RawWithEvents);
  await emit(ctx, "transaction.updated", { type: "Transaction", id: raw.id }, {
    description:   raw.description,
    changedFields,
  });
  return tx;
}

export async function softDeleteTransaction(ctx: RequestContext, id: number) {
  const existing = await ctx.db.transaction.findUnique({
    where: { id },
    select: { description: true, amount: true, brotherId: true, category: true, type: true, deletedAt: true },
  });
  if (!existing) throw new NotFoundError("Transaction");

  // Voiding a dues payment un-collects money, so it must also put the debt back. Without
  // this, deleting a mis-keyed payment removes the income and leaves the member marked
  // paid — the original bug, walking back in through the delete button.
  if (existing.deletedAt === null && isDuesPayment(existing)) {
    const brotherId = existing.brotherId!;
    const orgId     = ctx.orgId;

    // Both sides in one DB transaction, same as the payment that created them. The
    // deletedAt guard makes this idempotent: a double-delete restores the balance once.
    const restoredOwed = await ctx.db.$transaction(async (tx) => {
      const claimed = await tx.transaction.updateMany({
        where: { id, organizationId: orgId, deletedAt: null },
        data:  { deletedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictError("This transaction was already voided.");

      // The raw tx client is not org-scoped — carry organizationId explicitly.
      await tx.brother.updateMany({
        where: { id: brotherId, organizationId: orgId },
        data:  { duesOwed: { increment: existing.amount } },
      });

      const brother = await tx.brother.findUnique({
        where:  { id: brotherId },
        select: { duesOwed: true },
      });
      return Math.round((brother?.duesOwed ?? 0) * 100) / 100;
    });

    await emit(ctx, "dues.payment_voided", { type: "Transaction", id }, {
      brotherId,
      amount:        existing.amount,
      transactionId: id,
      restoredOwed,
    });
    return;
  }

  await ctx.db.transaction.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await emit(ctx, "transaction.soft_deleted", { type: "Transaction", id }, {
    description: existing.description,
    amount:      existing.amount,
  });
}
