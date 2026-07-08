/**
 * Attendance-exemption service.
 *
 * A member marked exempt for a semester is removed from every mandatory event's
 * eligible set that term and parked at the ATTENDANCE_EXEMPT sentinel in the
 * roster. Mirrors the excuse-service shape: public methods take
 * (ctx, validatedInput), reads/writes go through ctx.db (org-scoped), side
 * effects flow through emit() — the recalc runs in a handler, not inline.
 */

import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getActiveSemester } from "@/lib/attendance";
import type { SetExemptionInput } from "@/lib/validation/exemption";

export interface ExemptionListItem {
  id:          number;
  brotherId:   number;
  brotherName: string;
  semesterId:  number;
  reason:      string;
  note:        string | null;
  createdAt:   string;
}

/**
 * List exemptions for the active org, optionally scoped to one semester.
 * Requires MANAGE_ATTENDANCE (caller enforces via buildContext).
 */
export async function listExemptions(
  ctx: RequestContext,
  opts: { semesterId?: number } = {},
): Promise<ExemptionListItem[]> {
  const rows = await ctx.db.attendanceExemption.findMany({
    where: opts.semesterId ? { semesterId: opts.semesterId } : {},
    orderBy: { createdAt: "asc" },
    include: { brother: { select: { id: true, name: true } } },
  });
  return rows.map(e => ({
    id:          e.id,
    brotherId:   e.brotherId,
    brotherName: e.brother.name,
    semesterId:  e.semesterId,
    reason:      e.reason,
    note:        e.note,
    createdAt:   e.createdAt.toISOString(),
  }));
}

/**
 * Mark a member exempt for a semester (upsert on the semester+brother unique).
 * Defaults to the active semester. Emits exemption.changed → recalc handler
 * parks the brother at the exempt sentinel.
 */
export async function setExemption(
  ctx: RequestContext,
  input: SetExemptionInput,
): Promise<{ brotherId: number; semesterId: number; attendance: number | null }> {
  const [semester, brother] = await Promise.all([
    input.semesterId
      ? ctx.db.semester.findUnique({ where: { id: input.semesterId }, select: { id: true } })
      : getActiveSemester(ctx.db),
    ctx.db.brother.findUnique({ where: { id: input.brotherId }, select: { id: true } }),
  ]);
  if (!semester) throw new ValidationError(input.semesterId ? "Semester not found" : "No active semester");
  if (!brother)  throw new NotFoundError("Brother");

  await ctx.db.attendanceExemption.upsert({
    where: { semesterId_brotherId: { semesterId: semester.id, brotherId: input.brotherId } },
    update: { reason: input.reason, note: input.note ?? null },
    create: {
      brotherId:   input.brotherId,
      semesterId:  semester.id,
      reason:      input.reason,
      note:        input.note ?? null,
      createdById: ctx.actorId,
    },
  });

  await emit(
    ctx,
    "exemption.changed",
    { type: "Brother", id: input.brotherId },
    { brotherId: input.brotherId, semesterId: semester.id },
  );

  const refreshed = await ctx.db.brother.findUnique({
    where: { id: input.brotherId },
    select: { attendance: true },
  });
  return { brotherId: input.brotherId, semesterId: semester.id, attendance: refreshed?.attendance ?? null };
}

/**
 * Clear a member's exemption for a semester (defaults to active). Emits
 * exemption.changed → recalc handler restores a real ratio. Clearing a
 * non-existent exemption is a no-op, but still recalcs so the roster is correct.
 */
export async function clearExemption(
  ctx: RequestContext,
  brotherId: number,
  semesterId?: number,
): Promise<{ brotherId: number; semesterId: number; attendance: number | null }> {
  const semester = semesterId
    ? await ctx.db.semester.findUnique({ where: { id: semesterId }, select: { id: true } })
    : await getActiveSemester(ctx.db);
  if (!semester) throw new ValidationError(semesterId ? "Semester not found" : "No active semester");

  // deleteMany (not delete) so a missing row is a no-op rather than a throw; the
  // org scope on ctx.db.attendanceExemption keeps this from touching foreign orgs.
  await ctx.db.attendanceExemption.deleteMany({
    where: { brotherId, semesterId: semester.id },
  });

  await emit(
    ctx,
    "exemption.changed",
    { type: "Brother", id: brotherId },
    { brotherId, semesterId: semester.id },
  );

  const refreshed = await ctx.db.brother.findUnique({
    where: { id: brotherId },
    select: { attendance: true },
  });
  return { brotherId, semesterId: semester.id, attendance: refreshed?.attendance ?? null };
}
