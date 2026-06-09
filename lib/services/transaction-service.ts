import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import type { CreateTransactionInput, UpdateTransactionInput } from "@/lib/validation/transaction";

export interface TxFilter {
  type?: string;
  semester?: string;
  category?: string;
}

// amountCents is a BigInt mirror of `amount`, kept for exact-integer math on
// the write side. It must be omitted from anything that gets JSON-serialized
// (Response.json → JSON.stringify can't serialize BigInt) and the client never
// reads it — the Transaction type in app/data.ts only has `amount: number`.
const OMIT_BIGINT = { amountCents: true } as const;

export async function listTransactions(ctx: RequestContext, filter: TxFilter = {}) {
  return ctx.db.transaction.findMany({
    where: {
      deletedAt: null,
      ...(filter.type     ? { type: filter.type }         : {}),
      ...(filter.semester ? { semester: filter.semester } : {}),
      ...(filter.category ? { category: filter.category } : {}),
    },
    omit: OMIT_BIGINT,
    orderBy: { date: "desc" },
  });
}

export async function createTransaction(ctx: RequestContext, input: CreateTransactionInput) {
  const tx = await ctx.db.transaction.create({
    data: {
      type:          input.type,
      category:      input.category,
      amount:        input.amount,
      amountCents:   BigInt(Math.round(input.amount * 100)),
      date:          input.date,
      description:   input.description,
      paymentMethod: input.paymentMethod ?? null,
      paidTo:        input.paidTo        ?? null,
      semester:      input.semester      ?? null,
      status:        input.status        ?? "posted",
    },
    omit: OMIT_BIGINT,
  });
  await emit(ctx, "transaction.created", { type: "Transaction", id: tx.id }, {
    type:        tx.type as "income" | "expense",
    category:    tx.category,
    amount:      tx.amount,
    description: tx.description,
  });
  return tx;
}

export async function updateTransaction(ctx: RequestContext, id: number, input: UpdateTransactionInput) {
  const data: Prisma.TransactionUpdateInput = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(input) as (keyof UpdateTransactionInput)[]) {
    const v = input[k];
    if (v === undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = v;
    changedFields.push(k);
    if (k === "amount" && typeof v === "number") {
      data.amountCents = BigInt(Math.round(v * 100));
      changedFields.push("amountCents");
    }
  }

  const tx = await ctx.db.transaction.update({ where: { id }, data, omit: OMIT_BIGINT });
  await emit(ctx, "transaction.updated", { type: "Transaction", id: tx.id }, {
    description:   tx.description,
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
