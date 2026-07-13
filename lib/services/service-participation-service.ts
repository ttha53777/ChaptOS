import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import type { LogMyParticipationInput, LogParticipationInput, UpdateParticipationInput } from "@/lib/validation/service-participation";

// The org-scoped delegate's findMany signature isn't generic over `include`
// (see lib/db/tenant.ts), so the payload type needs a manual cast.
const PARTICIPATION_INCLUDE = {
  brother: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.ServiceParticipationInclude;

type ParticipationRow = Prisma.ServiceParticipationGetPayload<{ include: typeof PARTICIPATION_INCLUDE }>;

/** Participation rows for one service event, each with the member's name/avatar
 *  for the per-event roster. Org-scoped via ctx.db. */
export async function listParticipationForEvent(ctx: RequestContext, serviceEventId: number) {
  // Confirm the event is in this org before listing (avoids leaking row counts
  // for another org's event id).
  const event = await ctx.db.serviceEvent.findUnique({ where: { id: serviceEventId } });
  if (!event) throw new NotFoundError("Service event");

  const rows = await ctx.db.serviceParticipation.findMany({
    where: { serviceEventId },
    include: PARTICIPATION_INCLUDE,
    orderBy: { brother: { name: "asc" } },
  }) as ParticipationRow[];
  // Org-local display name (Membership.name), same fallback rule as the roster.
  // Without this, a member who renamed themselves in this org would still show
  // their stale name on the service-hours roster.
  const nameByBrotherId = await ctx.db.membership.resolveNames(
    rows.map(r => ({ id: r.brother.id, name: r.brother.name })),
  );
  return rows.map(r => ({
    ...r,
    brother: { ...r.brother, name: nameByBrotherId.get(r.brother.id) ?? r.brother.name },
  }));
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
