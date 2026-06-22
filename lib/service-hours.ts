/**
 * Service-hours rollup. Brother.serviceHours is a derived aggregate —
 * SUM(ServiceParticipation.hours) for that member — recomputed by the
 * recalc-service-hours event handler whenever participation rows change.
 *
 * This mirrors lib/attendance.ts (Brother.attendance ← AttendanceRecord rows):
 * services never write serviceHours directly; they emit a participation event
 * and these functions reconcile the aggregate. Eventually-consistent — a failed
 * recalc is corrected by the next participation write.
 *
 * Service hours are org-scoped, not semester-scoped: serviceHours is a single
 * Float on Brother and the goal is "per semester" only by convention. Keep it
 * that way to match the dashboard math and the existing column.
 */
import { db } from "@/lib/db";

/** Org-scoped data accessor (same shape as ctx.db). */
type Scoped = ReturnType<typeof db>;

/**
 * Recompute one member's serviceHours from their participation rows.
 * Reads only that member's rows; writes only that member's row, scoped to the
 * owning org so a caller bug cannot touch another org's member.
 */
export async function recalcBrotherServiceHours(
  scoped: Scoped,
  brotherId: number,
): Promise<number> {
  const rows = await scoped.serviceParticipation.findMany({
    where: { brotherId },
    select: { hours: true },
  });
  const total = rows.reduce((sum, r) => sum + r.hours, 0);

  await scoped.brother.updateMany({
    where: { id: brotherId },
    data: { serviceHours: total },
  });

  return total;
}

/**
 * Recompute serviceHours for a specific set of members (e.g. everyone touched by
 * a single "log hours" submission). One updateMany per distinct total keeps the
 * write count small regardless of how many members were logged at once. Wrapped
 * in a transaction so the batch commits atomically.
 */
export async function recalcBrothersServiceHours(
  scoped: Scoped,
  brotherIds: number[],
): Promise<void> {
  if (brotherIds.length === 0) return;

  const rows = await scoped.serviceParticipation.findMany({
    where: { brotherId: { in: brotherIds } },
    select: { brotherId: true, hours: true },
  });

  const totalByBrother = new Map<number, number>();
  for (const id of brotherIds) totalByBrother.set(id, 0); // members whose rows were all removed → 0
  for (const r of rows) {
    totalByBrother.set(r.brotherId, (totalByBrother.get(r.brotherId) ?? 0) + r.hours);
  }

  // Group member ids by computed total so we batch one updateMany per distinct value.
  const byTotal = new Map<number, number[]>();
  for (const [id, total] of totalByBrother) {
    const ids = byTotal.get(total) ?? [];
    ids.push(id);
    byTotal.set(total, ids);
  }

  await writeTotals(scoped, byTotal);
}

/**
 * Recompute every non-ghost member's serviceHours for the org. Used when a whole
 * service event is deleted (its participations cascade away and any number of
 * members' totals may drop). Same batch-by-total strategy as above.
 */
export async function recalcAllBrothersServiceHours(scoped: Scoped): Promise<void> {
  const [brothers, allRows] = await Promise.all([
    scoped.brother.findMany({ where: { isGhost: false }, select: { id: true } }),
    scoped.serviceParticipation.findMany({ select: { brotherId: true, hours: true } }),
  ]);

  const totalByBrother = new Map<number, number>();
  for (const b of brothers) totalByBrother.set(b.id, 0);
  for (const r of allRows) {
    if (!totalByBrother.has(r.brotherId)) continue; // ignore rows for ghosts/removed members
    totalByBrother.set(r.brotherId, (totalByBrother.get(r.brotherId) ?? 0) + r.hours);
  }

  const byTotal = new Map<number, number[]>();
  for (const [id, total] of totalByBrother) {
    const ids = byTotal.get(total) ?? [];
    ids.push(id);
    byTotal.set(total, ids);
  }

  await writeTotals(scoped, byTotal);
}

/**
 * One updateMany per distinct total, inside scoped.$transaction so the batch is
 * atomic AND app.org_id is set for the writes. The tx client is raw, so the
 * organizationId guard stays explicit.
 */
async function writeTotals(scoped: Scoped, byTotal: Map<number, number[]>): Promise<void> {
  const entries = Array.from(byTotal.entries());
  if (entries.length === 0) return;
  await scoped.$transaction(async tx => {
    for (const [total, ids] of entries) {
      await tx.brother.updateMany({
        where: { id: { in: ids }, organizationId: scoped.orgId },
        data: { serviceHours: total },
      });
    }
  });
}
