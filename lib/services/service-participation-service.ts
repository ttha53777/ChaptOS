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
  // Only people on this org's roster. logParticipation used to accept any
  // brotherId, so a row may exist for someone outside the org — and the
  // Brother.name fallback below would hand their account name and avatar to
  // whoever reads this list.
  const onRoster = new Set(await ctx.db.member.listIds({ brotherId: { in: rows.map(r => r.brotherId) } }));
  const members = rows.filter(r => onRoster.has(r.brotherId));
  // Org-local display name (Membership.name), same fallback rule as the roster.
  // Without this, a member who renamed themselves in this org would still show
  // their stale name on the service-hours roster.
  const nameByBrotherId = await ctx.db.member.resolveNames(
    members.map(r => ({ id: r.brother.id, name: r.brother.name })),
  );
  return members.map(r => ({
    ...r,
    brother: { ...r.brother, name: nameByBrotherId.get(r.brother.id) ?? r.brother.name },
  }));
}

/**
 * Upsert the hours for the listed members at one service event. Members already
 * having a row are updated; new members get a row created. Members not in the
 * payload are left as-is. Emits one `service_participation.logged` carrying every
 * affected member id so the recalc handler refreshes their serviceHours totals.
 *
 * Every id must be on this org's roster, checked before anything is written:
 * the FK only proves the Brother exists somewhere, and RLS only checks the row's
 * organizationId, so an unchecked id let an officer pin a stranger to their own
 * event and read back that stranger's name and avatar. A repeated id keeps its
 * last entry. The writes share one transaction, so a failure leaves nothing
 * behind with a stale total.
 */
export async function logParticipation(ctx: RequestContext, serviceEventId: number, input: LogParticipationInput) {
  const event = await ctx.db.serviceEvent.findUnique({ where: { id: serviceEventId } });
  if (!event) throw new NotFoundError("Service event");

  const hoursByBrother = new Map(input.entries.map(e => [e.brotherId, e.hours]));
  const brotherIds = [...hoursByBrother.keys()];
  const found = await ctx.db.member.listIds({ brotherId: { in: brotherIds } });
  if (found.length !== brotherIds.length) throw new NotFoundError("Member");

  // Set-based, like attendance-service.recordAttendance: a per-member loop inside
  // a transaction times out on a big roster. Insert the missing rows (skipping
  // any that exist, including one a concurrent request just made, so neither
  // fails with a duplicate), then set hours with one updateMany per distinct
  // value. The tx client is raw, so organizationId is carried explicitly.
  const idsByHours = new Map<number, number[]>();
  for (const [brotherId, hours] of hoursByBrother) idsByHours.set(hours, [...(idsByHours.get(hours) ?? []), brotherId]);
  await ctx.db.$transaction(async tx => {
    await tx.serviceParticipation.createMany({
      data: [...hoursByBrother].map(([brotherId, hours]) => ({ organizationId: ctx.orgId, serviceEventId, brotherId, hours })),
      skipDuplicates: true,
    });
    for (const [hours, ids] of idsByHours) {
      await tx.serviceParticipation.updateMany({
        where: { organizationId: ctx.orgId, serviceEventId, brotherId: { in: ids }, hours: { not: hours } },
        data:  { hours },
      });
    }
  });

  const totalHours = [...hoursByBrother.values()].reduce((s, h) => s + h, 0);

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
