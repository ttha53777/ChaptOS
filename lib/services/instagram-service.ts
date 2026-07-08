import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import { todayISO } from "@/lib/dates";
import type { CreateInstagramTaskInput, UpdateInstagramTaskInput } from "@/lib/validation/instagram";

export async function listInstagramTasks(ctx: RequestContext) {
  return ctx.db.instagramTask.findMany({ orderBy: { id: "asc" } });
}

// Confirm a linked event exists in this org before we write the FK (mirrors
// validateEventIds in transaction-service). null/undefined means "no link".
async function validateEventId(ctx: RequestContext, id: number | null | undefined): Promise<void> {
  if (id == null) return;
  const found = await ctx.db.calendarEvent.findFirst({
    where: { id, organizationId: ctx.orgId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("CalendarEvent");
}

export async function createInstagramTask(ctx: RequestContext, input: CreateInstagramTaskInput) {
  await validateEventId(ctx, input.calendarEventId);
  const t = await ctx.db.instagramTask.create({
    data: { ...input, calendarEventId: input.calendarEventId ?? null },
  });
  await emit(ctx, "instagram_task.created", { type: "InstagramTask", id: t.id }, { title: t.title, dueDate: t.dueDate });
  return t;
}

export async function updateInstagramTask(ctx: RequestContext, id: number, input: UpdateInstagramTaskInput) {
  if (input.calendarEventId !== undefined) await validateEventId(ctx, input.calendarEventId);
  const data: Prisma.InstagramTaskUpdateInput = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(input) as (keyof UpdateInstagramTaskInput)[]) {
    if (input[k] === undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = input[k];
    changedFields.push(k);
  }
  // Marking a post "posted" without an explicit posting date defaults it to
  // today — the day it was actually marked live — not the (possibly past or
  // future) due date. An explicit postedDate in the same request wins.
  if (input.status === "posted" && input.postedDate === undefined) {
    const current = await ctx.db.instagramTask.findUnique({ where: { id }, select: { postedDate: true } });
    if (current && current.postedDate == null) {
      data.postedDate = todayISO();
      changedFields.push("postedDate");
    }
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
