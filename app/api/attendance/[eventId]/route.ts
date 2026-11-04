import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { getActiveSemester } from "@/lib/attendance";
import { ExcuseStatus } from "@/lib/state";
import { logError } from "@/lib/observability";
import { hasPermission } from "@/lib/permissions";
import { checkInState } from "@/lib/checkin";
import { CheckInStatus } from "@/lib/state";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { eventId } = await params;
    const calendarEventId = Number(eventId);
    if (!Number.isInteger(calendarEventId) || calendarEventId <= 0) throw new ValidationError("Invalid eventId");

    const semester = await getActiveSemester(ctx.db);
    // No active semester is an empty state, not a client error: there's simply no
    // attendance to report yet. Return empty buckets so the rail renders its empty
    // state instead of the timeline logging a spurious 400.
    if (!semester) return Response.json({ excused: [], unexcused: [], attended: [], exempt: [], checkInOpen: false });

    const [event, records, excuses, exemptions] = await Promise.all([
      ctx.db.calendarEvent.findUnique({
        where: { id: calendarEventId },
        select: { checkInOpenedAt: true, checkInClosedAt: true },
      }),
      ctx.db.attendanceRecord.findMany({
        where: { calendarEventId, semesterId: semester.id },
        include: { brother: { select: { id: true, name: true } } },
      }),
      ctx.db.attendanceExcuse.findMany({
        where: { calendarEventId, semesterId: semester.id, status: ExcuseStatus.Approved },
        include: { brother: { select: { id: true, name: true } } },
      }),
      ctx.db.attendanceExemption.findMany({
        where: { semesterId: semester.id },
        select: { brotherId: true },
      }),
    ]);

    // Names shown here are this org's Membership.name where the brother set one,
    // else the account-level Brother.name — same fallback as the roster. Without
    // this, a member who renamed themselves in this org would still show their
    // stale name on the attendance rail / timeline detail popover.
    const nameByBrotherId = await ctx.db.member.resolveNames(
      [...records, ...excuses].map(r => ({ id: r.brotherId, name: r.brother.name })),
    );

    const excusedBrotherIds = new Set(excuses.map(e => e.brotherId));
    // Semester-exempt members drop from every bucket, so the timeline log form
    // (built from attended + unexcused) never lists them.
    const exemptBrotherIds = new Set(exemptions.map(e => e.brotherId));
    const attended = records.filter(r => r.attended && !excusedBrotherIds.has(r.brotherId) && !exemptBrotherIds.has(r.brotherId))
      .map(r => ({ brotherId: r.brotherId, brotherName: nameByBrotherId.get(r.brotherId) ?? r.brother.name, at: r.loggedAt.toISOString() }));
    const unexcused = records.filter(r => !r.attended && !excusedBrotherIds.has(r.brotherId) && !exemptBrotherIds.has(r.brotherId))
      .map(r => ({ brotherId: r.brotherId, brotherName: nameByBrotherId.get(r.brotherId) ?? r.brother.name }));
    // Every member can see who was excused; the reason (often medical or
    // personal) only attendance managers and the member who wrote it.
    const canSeeReasons = ctx.isOrgAdmin || ctx.isPlatformAdmin || hasPermission(ctx.permissions, "MANAGE_ATTENDANCE");
    const excused = excuses.map(e => ({
      brotherId: e.brotherId,
      brotherName: nameByBrotherId.get(e.brotherId) ?? e.brother.name,
      reason: canSeeReasons || e.brotherId === ctx.actorId ? e.reason : null,
      isRetroactive: e.isRetroactive,
    }));

    // While members can still tap themselves in, the officer's sheet starts from
    // the real check-ins (not "everyone present") and keeps refreshing.
    const status = event ? checkInState(event) : null;
    const checkInOpen = status === CheckInStatus.Open || status === CheckInStatus.Closing;

    return Response.json({ excused, unexcused, attended, exempt: [...exemptBrotherIds], checkInOpen });
  } catch (e) {
    logError(e, { route: "/api/attendance/[eventId]", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
