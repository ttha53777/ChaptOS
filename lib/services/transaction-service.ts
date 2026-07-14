import type { RequestContext } from "@/lib/context";
import { DUES_CATEGORY } from "@/lib/dues";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { TransactionType } from "@/lib/state";
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
 * transaction that minted them (see dues-service.recordDuesPayment). The generic
 * transaction routes are therefore a back door into the exact drift this whole change
 * closes — editing or deleting one of these rows here, without touching the balance,
 * puts the two books right back out of step. So this predicate gates both.
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

export async function createTransaction(ctx: RequestContext, input: CreateTransactionInput) {
  const ids = input.calendarEventIds ?? [];
  await validateEventIds(ctx, ids);

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
