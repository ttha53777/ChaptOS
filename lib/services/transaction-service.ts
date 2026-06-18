import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
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
    select: { description: true, amount: true },
  });
  if (!existing) throw new NotFoundError("Transaction");

  await ctx.db.transaction.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await emit(ctx, "transaction.soft_deleted", { type: "Transaction", id }, {
    description: existing.description,
    amount:      existing.amount,
  });
}
