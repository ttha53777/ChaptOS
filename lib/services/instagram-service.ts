import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import type { CreateInstagramTaskInput, UpdateInstagramTaskInput } from "@/lib/validation/instagram";

export async function listInstagramTasks(ctx: RequestContext) {
  return ctx.db.instagramTask.findMany({ orderBy: { id: "asc" } });
}

export async function createInstagramTask(ctx: RequestContext, input: CreateInstagramTaskInput) {
  const t = await ctx.db.instagramTask.create({ data: input });
  await emit(ctx, "instagram_task.created", { type: "InstagramTask", id: t.id }, { title: t.title, dueDate: t.dueDate });
  return t;
}

export async function updateInstagramTask(ctx: RequestContext, id: number, input: UpdateInstagramTaskInput) {
  const data: Prisma.InstagramTaskUpdateInput = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(input) as (keyof UpdateInstagramTaskInput)[]) {
    if (input[k] === undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = input[k];
    changedFields.push(k);
  }
  const t = await ctx.db.instagramTask.update({ where: { id }, data });
  await emit(ctx, "instagram_task.updated", { type: "InstagramTask", id: t.id }, { title: t.title, changedFields });
  return t;
}

export async function deleteInstagramTask(ctx: RequestContext, id: number) {
  const target = await ctx.db.instagramTask.findUnique({ where: { id }, select: { title: true } });
  if (!target) throw new NotFoundError("Instagram task");
  await ctx.db.instagramTask.delete({ where: { id } });
  await emit(ctx, "instagram_task.deleted", { type: "InstagramTask", id }, { title: target.title });
}
