import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import type { CreateDeadlineInput, UpdateDeadlineInput } from "@/lib/validation/deadline";

export async function listDeadlines(ctx: RequestContext) {
  return ctx.db.deadline.findMany({ orderBy: { id: "asc" } });
}

export async function createDeadline(ctx: RequestContext, input: CreateDeadlineInput) {
  const d = await ctx.db.deadline.create({ data: input });
  await emit(ctx, "deadline.created", { type: "Deadline", id: d.id }, { title: d.title, dueDate: d.dueDate });
  return d;
}

export async function updateDeadline(ctx: RequestContext, id: number, input: UpdateDeadlineInput) {
  const data: Prisma.DeadlineUpdateInput = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(input) as (keyof UpdateDeadlineInput)[]) {
    if (input[k] === undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = input[k];
    changedFields.push(k);
  }
  const d = await ctx.db.deadline.update({ where: { id }, data });
  await emit(ctx, "deadline.updated", { type: "Deadline", id: d.id }, { title: d.title, changedFields });
  return d;
}

export async function deleteDeadline(ctx: RequestContext, id: number) {
  const target = await ctx.db.deadline.findUnique({ where: { id }, select: { title: true } });
  if (!target) throw new NotFoundError("Deadline");
  await ctx.db.deadline.delete({ where: { id } });
  await emit(ctx, "deadline.deleted", { type: "Deadline", id }, { title: target.title });
}
