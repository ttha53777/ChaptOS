import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import type { LogMyParticipationInput, LogParticipationInput, UpdateParticipationInput } from "@/lib/validation/service-participation";

/** Participation rows for one service event, each with the member's name/avatar
 *  for the per-event roster. Org-scoped via ctx.db. */
export async function listParticipationForEvent(ctx: RequestContext, serviceEventId: number) {
  // Confirm the event is in this org before listing (avoids leaking row counts
  // for another org's event id).
  const event = await ctx.db.serviceEvent.findUnique({ where: { id: serviceEventId } });
  if (!event) throw new NotFoundError("Service event");

  return ctx.db.serviceParticipation.findMany({
    where: { serviceEventId },
    include: { brother: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { brother: { name: "asc" } },
  });
}

/**
 * Upsert the hours for the listed members at one service event. Members already
 * having a row are updated; new members get a row created. Members not in the
 * payload are left as-is. Emits one `service_participation.logged` carrying every
 * affected member id so the recalc handler refreshes their serviceHours totals.
 */
export async function logParticipation(ctx: RequestContext, serviceEventId: number, input: LogParticipationInput) {
  const event = await ctx.db.serviceEvent.findUnique({ where: { id: serviceEventId } });
  if (!event) throw new NotFoundError("Service event");

  // Existing rows for this event, keyed by member, so we know create vs update.
  const existing = await ctx.db.serviceParticipation.findMany({ where: { serviceEventId } });
  const byBrother = new Map(existing.map(r => [r.brotherId, r]));

  for (const entry of input.entries) {
    const row = byBrother.get(entry.brotherId);
    if (row) {
      if (row.hours !== entry.hours) {
        await ctx.db.serviceParticipation.update({ where: { id: row.id }, data: { hours: entry.hours } });
      }
    } else {
      await ctx.db.serviceParticipation.create({
        data: { serviceEventId, brotherId: entry.brotherId, hours: entry.hours },
      });
    }
  }

  const brotherIds = input.entries.map(e => e.brotherId);
  const totalHours = input.entries.reduce((s, e) => s + e.hours, 0);

  await emit(ctx, "service_participation.logged", { type: "ServiceEvent", id: serviceEventId }, {
    serviceEventId, eventTitle: event.title, brotherIds, totalHours,
  });

  return listParticipationForEvent(ctx, serviceEventId);
}

/**
 * Self-service: the acting member upserts their own hours for one event. Reuses
 * logParticipation with a single entry pinned to ctx.actorId, so a member can
 * never write another member's row. Open to any org member (no MANAGE_SERVICE).
 */
export async function logMyParticipation(ctx: RequestContext, serviceEventId: number, input: LogMyParticipationInput) {
  return logParticipation(ctx, serviceEventId, {
    entries: [{ brotherId: ctx.actorId, hours: input.hours }],
  });
}

/** Update one participation row's hours in place. */
export async function updateParticipation(ctx: RequestContext, id: number, input: UpdateParticipationInput) {
  const existing = await ctx.db.serviceParticipation.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Service participation");

  const updated = await ctx.db.serviceParticipation.update({ where: { id }, data: { hours: input.hours } });

  await emit(ctx, "service_participation.logged", { type: "ServiceEvent", id: existing.serviceEventId }, {
    serviceEventId: existing.serviceEventId, eventTitle: "", brotherIds: [existing.brotherId], totalHours: input.hours,
  });

  return updated;
}

/** Remove one member's participation in an event; their serviceHours recompute. */
export async function removeParticipation(ctx: RequestContext, id: number) {
  const existing = await ctx.db.serviceParticipation.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Service participation");

  await ctx.db.serviceParticipation.delete({ where: { id } });

  await emit(ctx, "service_participation.removed", { type: "ServiceParticipation", id }, {
    serviceEventId: existing.serviceEventId, brotherId: existing.brotherId,
  });
}
