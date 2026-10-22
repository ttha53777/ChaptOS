import type { RequestContext } from "@/lib/context";
import {
  PAIR_WINDOW_AFTER_MS, PAIR_WINDOW_BEFORE_MS, pairActivityCategories, type ActivityCategory,
} from "@/lib/activity-category";

export interface ActivityFeedEntry {
  id: number;
  message: string;
  type: string;
  /** Relative, e.g. "3h ago". */
  timestamp: string;
  /** The exact instant, ISO 8601 — what the Activity spotlight groups by day. */
  at: string;
  actorId: number | null;
  /** What the row is about, recovered from the event that wrote it; null when
   *  there's no such event (see lib/activity-category.ts). */
  category: ActivityCategory | null;
}

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * The dashboard's recent-activity feed: the latest ActivityLog rows, each
 * tagged with a category from its OperationalEvent.
 *
 * The event read is one query of narrow per-row time windows (OR'd ranges on
 * the (organizationId, occurredAt) index), not one wide range: twenty rows can
 * span weeks, and a busy org emits far more events than it shows.
 */
export async function listRecentActivity(
  ctx: RequestContext,
  opts: { limit?: number; before?: number; since?: Date } = {},
): Promise<ActivityFeedEntry[]> {
  const { limit = 20, before, since } = opts;
  // Keyset cursor on (timestamp, id): ids aren't guaranteed to follow
  // timestamps, so "older than row N" means older than N's instant, with the id
  // breaking ties. The cursor row is read through the scoped client, so another
  // org's id resolves to nothing and the page is simply empty.
  let olderThan: { timestamp: Date; id: number } | null = null;
  if (before != null) {
    const cursor = await ctx.db.activityLog.findFirst({ where: { id: before }, select: { id: true, timestamp: true } });
    if (!cursor) return [];
    olderThan = cursor;
  }
  const logs = await ctx.db.activityLog.findMany({
    where: {
      ...(since ? { timestamp: { gte: since } } : {}),
      ...(olderThan ? { OR: [
        { timestamp: { lt: olderThan.timestamp } },
        { timestamp: olderThan.timestamp, id: { lt: olderThan.id } },
      ] } : {}),
    },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take: limit,
  });
  if (logs.length === 0) return [];

  const events = await ctx.db.operationalEvent.findMany({
    where: {
      OR: logs.map(l => ({
        occurredAt: {
          gte: new Date(l.timestamp.getTime() - PAIR_WINDOW_BEFORE_MS),
          lte: new Date(l.timestamp.getTime() + PAIR_WINDOW_AFTER_MS),
        },
      })),
    },
    select: { action: true, actorId: true, occurredAt: true },
  });
  const categories = pairActivityCategories(logs, events);

  return logs.map(l => ({
    id: l.id,
    message: l.message,
    type: l.type,
    timestamp: relativeTime(l.timestamp),
    at: l.timestamp.toISOString(),
    actorId: l.actorId,
    category: categories.get(l.id) ?? null,
  }));
}
