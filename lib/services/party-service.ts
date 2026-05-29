import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import type { CreatePartyInput, UpdatePartyInput } from "@/lib/validation/party";

export async function listParties(ctx: RequestContext) {
  return ctx.db.partyEvent.findMany({ orderBy: { id: "asc" } });
}

export async function createParty(ctx: RequestContext, input: CreatePartyInput) {
  const p = await ctx.db.partyEvent.create({
    data: {
      name:        input.name,
      date:        input.date,
      partyType:   input.partyType === "Closed" ? "Closed" : "Open",
      theme:       input.theme     ?? "",
      collabOrg:   input.collabOrg ?? "",
      doorRevenue: input.doorRevenue,
      attendance:  input.attendance,
      expenses:    input.expenses,
      notes:       input.notes ?? "",
      completed:   false,
    },
  });
  await emit(ctx, "party.created", { type: "PartyEvent", id: p.id }, { name: p.name, date: p.date });
  return p;
}

export async function updateParty(ctx: RequestContext, id: number, input: UpdatePartyInput) {
  const data: Prisma.PartyEventUpdateInput = {};
  const changedFields: string[] = [];
  const completing = input.completed === true;

  for (const k of Object.keys(input) as (keyof UpdatePartyInput)[]) {
    if (input[k] === undefined) continue;
    if (k === "completed") continue; // handled separately below
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = input[k];
    changedFields.push(k);
  }
  if (input.completed !== undefined) {
    data.completed = completing;
    data.completedAt = completing ? new Date() : null;
    changedFields.push("completed");
  }

  const p = await ctx.db.partyEvent.update({ where: { id }, data });
  if (completing) {
    await emit(ctx, "party.completed", { type: "PartyEvent", id: p.id }, { name: p.name, date: p.date });
  } else {
    await emit(ctx, "party.updated", { type: "PartyEvent", id: p.id }, { name: p.name, changedFields });
  }
  return p;
}

export async function deleteParty(ctx: RequestContext, id: number) {
  const target = await ctx.db.partyEvent.findUnique({ where: { id }, select: { name: true } });
  if (!target) throw new NotFoundError("Party event");
  await ctx.db.partyEvent.delete({ where: { id } });
  await emit(ctx, "party.deleted", { type: "PartyEvent", id }, { name: target.name });
}
