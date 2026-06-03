/**
 * Excuse service.
 *
 * Reference implementation for the Phase 2.5 service layer. Pattern:
 *  - Public methods take (ctx: RequestContext, input: ValidatedInput).
 *  - Reads use ctx.db (org-scoped wrapper) or the raw prisma client for queries
 *    the wrapper can't type (interactive transactions, includes).
 *  - State guards throw typed DomainErrors; routes use toResponse() to map.
 *  - Side effects are NOT called inline — emit() events; handlers do the work.
 *
 * Routes that previously lived in app/api/excuses/ become 30-line controllers
 * after migration.
 */

import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { ExcuseStatus } from "@/lib/state";
import { hasPermission } from "@/lib/permissions";
import { getActiveSemester } from "@/lib/attendance";
import type { SubmitExcuseInput, DecideExcuseInput } from "@/lib/validation/excuse";

export interface ExcuseListItem {
  id:              number;
  brotherId:       number;
  brotherName:     string;
  calendarEventId: number;
  eventTitle:      string;
  eventDate:       string;
  reason:          string;
  status:          string;
  submittedAt:     string;
  isRetroactive:   boolean;
  rejectionNote:   string | null;
}

/**
 * List excuses for the active org. Optional pending-only filter.
 * Requires MANAGE_ATTENDANCE (caller enforces via ctx.permissions or buildContext).
 */
export async function listExcuses(
  ctx: RequestContext,
  opts: { pendingOnly?: boolean } = {},
): Promise<ExcuseListItem[]> {
  const where = opts.pendingOnly ? { status: ExcuseStatus.Pending } : {};
  const excuses = await ctx.db.attendanceExcuse.findMany({
    where,
    orderBy: { submittedAt: "asc" },
    include: {
      brother:       { select: { id: true, name: true } },
      calendarEvent: { select: { id: true, title: true, date: true } },
    },
  });
  return excuses.map(e => ({
    id:              e.id,
    brotherId:       e.brotherId,
    brotherName:     e.brother.name,
    calendarEventId: e.calendarEventId,
    eventTitle:     e.calendarEvent.title,
    eventDate:      e.calendarEvent.date,
    reason:          e.reason,
    status:          e.status,
    submittedAt:     e.submittedAt.toISOString(),
    isRetroactive:   e.isRetroactive,
    rejectionNote:   e.rejectionNote,
  }));
}

/**
 * Submit a new excuse. Members can only submit for themselves; MANAGE_ATTENDANCE
 * holders may submit on behalf of any brother. Admin submissions auto-approve.
 * Resubmission after rejection clears the rejection note and resets to pending.
 */
export async function submitExcuse(
  ctx: RequestContext,
  input: SubmitExcuseInput,
): Promise<{ brotherId: number; status: string; attendance: number | null }> {
  const canManage = hasPermission(ctx.permissions, "MANAGE_ATTENDANCE") || ctx.isPlatformAdmin;
  const brotherId = canManage && input.brotherId ? input.brotherId : ctx.actorId;
  const autoApproved = canManage;

  const [semester, brother, calendarEvent, existingRecord] = await Promise.all([
    getActiveSemester(ctx.orgId),
    ctx.db.brother.findUnique({ where: { id: brotherId }, select: { id: true, name: true } }),
    ctx.db.calendarEvent.findUnique({ where: { id: input.calendarEventId }, select: { id: true, title: true } }),
    ctx.db.attendanceRecord.findUnique({
      where: { calendarEventId_brotherId: { calendarEventId: input.calendarEventId, brotherId } },
    }),
  ]);

  if (!semester)       throw new ValidationError("No active semester");
  if (!brother)        throw new NotFoundError("Brother");
  if (!calendarEvent)  throw new NotFoundError("Event");

  const isRetroactive = !!existingRecord;
  const status = autoApproved ? ExcuseStatus.Approved : ExcuseStatus.Pending;

  let conflict: "approved" | "pending" | null = null;
  await ctx.db.$transaction(async (tx) => {
    const current = await tx.attendanceExcuse.findUnique({
      where: { calendarEventId_brotherId: { calendarEventId: input.calendarEventId, brotherId } },
      select: { status: true },
    });

    if (!canManage && current && current.status !== ExcuseStatus.Rejected) {
      conflict = current.status === ExcuseStatus.Approved ? "approved" : "pending";
      return;
    }

    await tx.attendanceExcuse.upsert({
      where: { calendarEventId_brotherId: { calendarEventId: input.calendarEventId, brotherId } },
      update: {
        reason:        input.reason,
        isRetroactive,
        status,
        decidedById:   autoApproved ? ctx.actorId : null,
        decidedAt:     autoApproved ? new Date() : null,
        rejectionNote: null,
        submittedAt:   new Date(),
      },
      create: {
        calendarEventId: input.calendarEventId,
        brotherId,
        semesterId:      semester.id,
        reason:          input.reason,
        isRetroactive,
        status,
        decidedById:     autoApproved ? ctx.actorId : null,
        decidedAt:       autoApproved ? new Date() : null,
      },
    });
  });

  if (conflict) {
    throw new ConflictError(
      conflict === "approved" ? "Excuse already approved" : "Excuse already pending review",
    );
  }

  const eventTitle = calendarEvent.title;

  // Look up the created excuse row to get its id for the event subject.
  const created = await ctx.db.attendanceExcuse.findUnique({
    where: { calendarEventId_brotherId: { calendarEventId: input.calendarEventId, brotherId } },
    select: { id: true },
  });

  await emit(
    ctx,
    "excuse.submitted",
    { type: "AttendanceExcuse", id: created?.id ?? 0 },
    { brotherId, calendarEventId: input.calendarEventId, semesterId: semester.id, reason: input.reason, isRetroactive, autoApproved },
  );

  // If auto-approved, the recalc handler runs synchronously. Read the fresh
  // attendance ratio back from the brother row to return it.
  let attendance: number | null = null;
  if (autoApproved) {
    const refreshed = await ctx.db.brother.findUnique({
      where: { id: brotherId },
      select: { attendance: true },
    });
    attendance = refreshed?.attendance ?? null;
  }

  return { brotherId, status, attendance };
}

/**
 * Decide a pending excuse. Approval triggers the recalc handler; rejection is
 * a no-op for attendance math but still flips the status.
 */
export async function decideExcuse(
  ctx: RequestContext,
  excuseId: number,
  input: DecideExcuseInput,
): Promise<{ id: number; brotherId: number; status: string; attendance: number | null }> {
  if (!Number.isInteger(excuseId) || excuseId <= 0) {
    throw new ValidationError("Invalid excuse id");
  }

  const rejectionNote = input.action === "reject"
    ? (input.rejectionNote ?? null)
    : null;

  // Tenancy gate: AttendanceExcuse has no organizationId column and is a raw
  // (unscoped) pass-through in db(), so a bare `id` WHERE would let a
  // MANAGE_ATTENDANCE holder in org A decide an excuse belonging to org B
  // (cross-tenant IDOR write + a recalc fired on a foreign brother). Scope the
  // match through the excuse's brother (org-bound) so a foreign excuse matches
  // zero rows and surfaces the same "no longer pending" conflict — non-leaky.
  const result = await ctx.db.attendanceExcuse.updateMany({
    where: { id: excuseId, status: ExcuseStatus.Pending, brother: { organizationId: ctx.orgId } },
    data: {
      status:        input.action === "approve" ? ExcuseStatus.Approved : ExcuseStatus.Rejected,
      decidedById:   ctx.actorId,
      decidedAt:     new Date(),
      rejectionNote,
    },
  });
  if (result.count === 0) {
    throw new ConflictError("Excuse is no longer pending");
  }

  const updated = await ctx.db.attendanceExcuse.findFirst({
    where: { id: excuseId, brother: { organizationId: ctx.orgId } },
    include: {
      brother:       { select: { id: true, name: true } },
      calendarEvent: { select: { id: true, title: true } },
    },
  });
  if (!updated) throw new NotFoundError("Excuse");

  if (input.action === "approve") {
    await emit(
      ctx,
      "excuse.approved",
      { type: "AttendanceExcuse", id: updated.id },
      { brotherId: updated.brotherId, calendarEventId: updated.calendarEventId, semesterId: updated.semesterId, eventTitle: updated.calendarEvent.title },
    );
  } else {
    await emit(
      ctx,
      "excuse.rejected",
      { type: "AttendanceExcuse", id: updated.id },
      { brotherId: updated.brotherId, calendarEventId: updated.calendarEventId, semesterId: updated.semesterId, eventTitle: updated.calendarEvent.title, rejectionNote },
    );
  }

  // Approval handler recalculated this brother; pull the fresh ratio.
  let attendance: number | null = null;
  if (input.action === "approve") {
    const refreshed = await ctx.db.brother.findUnique({
      where: { id: updated.brotherId },
      select: { attendance: true },
    });
    attendance = refreshed?.attendance ?? null;
  }

  return {
    id:        updated.id,
    brotherId: updated.brotherId,
    status:    updated.status,
    attendance,
  };
}
