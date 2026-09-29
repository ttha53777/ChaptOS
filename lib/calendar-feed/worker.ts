import { Prisma } from "@/app/generated/prisma/client";
import { feedOrigin } from "./config";
import { db } from "@/lib/db";
import { settleRequestedValidation } from "./validation";
import { calendarProjection, taskProjection, contentHash, cancellationRetention, type PublishedItem } from "./projection";

/** Same lock order for every worker. Read current rows AFTER locking work;
 * source transactions blocked on this slot enqueue a newer version on commit.
 * Thus retries/out-of-order wakeups cannot overwrite a newer projection. */
export async function refreshCalendarFeed(orgId: number, reconcile = false): Promise<void> {
  const scoped = db(orgId);
  let validationRequestedAt: Date | null = null;
  try {
    await scoped.$transaction(async tx => {
      const [work] = await tx.$queryRaw<{ version: number; appliedVersion: number }[]>(Prisma.sql`SELECT version, "appliedVersion" FROM "CalendarFeedWork" WHERE "organizationId" = ${orgId} FOR UPDATE`);
      if (!work || (!reconcile && work.version === work.appliedVersion)) return;
      // Read after the lock: a request committed before this point is covered by
      // the full projection below (requesting also enqueues, so it can't be skipped).
      validationRequestedAt = (await tx.calendarSubscription.findUnique({ where: { organizationId: orgId }, select: { validationRequestedAt: true } }))?.validationRequestedAt ?? null;
      const [calendar, tasks, previous] = await Promise.all([
        tx.calendarEvent.findMany({ where: { organizationId: orgId }, select: { id: true, title: true, date: true, time: true, location: true, category: true, schedule: true, programmingEvent: { select: { stage: true, organizationId: true } } } }),
        tx.task.findMany({ where: { organizationId: orgId }, select: { id: true, title: true, dueDate: true, status: true } }),
        tx.calendarFeedItem.findMany({ where: { organizationId: orgId } }),
      ]);
      const current = new Map<string, { sourceType: "calendar" | "task"; sourceId: number; published: PublishedItem }>();
      for (const row of calendar) {
        if (row.programmingEvent && row.programmingEvent.organizationId !== orgId) continue;
        const published = calendarProjection(row, row.programmingEvent?.stage);
        if (published) current.set(`calendar:${row.id}`, { sourceType: "calendar", sourceId: row.id, published });
      }
      for (const row of tasks) {
        const published = taskProjection(row);
        if (published) current.set(`task:${row.id}`, { sourceType: "task", sourceId: row.id, published });
      }
      const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { slug: true } });
      const origin = feedOrigin();
      for (const next of current.values()) next.published.url = `${origin}/${encodeURIComponent(org.slug)}/${next.sourceType === "task" ? "tasks" : "timeline"}?${next.sourceType === "task" ? "task" : "event"}=${next.sourceId}`;
      const now = new Date();
      for (const old of previous) {
        const key = `${old.sourceType}:${old.sourceId}`;
        const next = current.get(key);
        if (next) {
          const hash = contentHash(next.published);
          if (old.contentHash !== hash || old.cancelledAt) await tx.calendarFeedItem.update({ where: { id: old.id, organizationId: orgId }, data: { published: next.published as unknown as Prisma.InputJsonValue, contentHash: hash, revision: { increment: 1 }, changedAt: now, cancelledAt: null, retainUntil: null } });
          current.delete(key);
        } else if (!old.cancelledAt && old.published) {
          await tx.calendarFeedItem.update({ where: { id: old.id, organizationId: orgId }, data: { cancelledAt: now, retainUntil: cancellationRetention(old.published as unknown as PublishedItem, now), revision: { increment: 1 }, changedAt: now } });
        } else if (old.cancelledAt && old.retainUntil && old.retainUntil < now && old.published) {
          // Keep the identity forever; discard expired canceled content.
          await tx.calendarFeedItem.update({ where: { id: old.id, organizationId: orgId }, data: { published: Prisma.DbNull, contentHash: null } });
        }
      }
      for (const next of current.values()) await tx.calendarFeedItem.create({ data: { organizationId: orgId, sourceType: next.sourceType, sourceId: next.sourceId, published: next.published as unknown as Prisma.InputJsonValue, contentHash: contentHash(next.published), changedAt: now } });
      await tx.calendarFeedWork.update({ where: { organizationId: orgId }, data: { appliedVersion: work.version, processedAt: now, failedAt: null, failures: 0 } });
    }, { timeout: 60_000 });
  } catch (error) {
    await scoped.$transaction(tx => tx.calendarFeedWork.updateMany({ where: { organizationId: orgId }, data: { failedAt: new Date(), failures: { increment: 1 } } })).catch(() => {});
    throw error;
  }
  if (validationRequestedAt) await settleRequestedValidation(orgId, validationRequestedAt);
}
