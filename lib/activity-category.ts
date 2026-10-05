/**
 * What an activity-feed row is about — "Dues", "Request", "Programming" — for
 * the category pill on the dashboard's Activity card.
 *
 * ActivityLog rows are free text and carry no action. But every row written by
 * emit() (lib/events/emit.ts) is the dual-write of an OperationalEvent inserted
 * a moment earlier in the same request, by the same actor, and that event does
 * carry `action`. So the category is recovered by pairing each feed row with
 * its event rather than by adding a column: the feed is meant to become an
 * OperationalEvent projection anyway (see the emit.ts header), and a column
 * would only be backfillable by this same pairing.
 *
 * Pure (no DB, no React) so the service and the client share the ids, and so
 * the pairing is testable on its own.
 */

export type ActivityCategory =
  | "attendance" | "dues" | "treasury" | "request" | "announcement" | "programming"
  | "calendar" | "members" | "service" | "parties" | "tasks" | "docs" | "instagram"
  | "metrics" | "settings";

/** Action prefix (the `subject` of `subject.verb`) → category. Anything absent
 *  (billing.*, assistant.*) is never shown in the feed and gets no pill. */
const BY_SUBJECT: Record<string, ActivityCategory> = {
  attendance: "attendance", excuse: "attendance", checkin: "attendance", exemption: "attendance",
  dues: "dues", dues_payment: "dues",
  transaction: "treasury", budget: "treasury", transaction_category: "treasury", treasury: "treasury",
  reimbursement: "request",
  announcement: "announcement",
  programming: "programming", event_field: "programming",
  calendar: "calendar", calendar_event_type: "calendar", semester: "calendar",
  brother: "members", role: "members", membership: "members", invite: "members", join_request: "members",
  service_event: "service", service_participation: "service",
  party: "parties",
  task: "tasks", poll: "tasks",
  doc: "docs", docFolder: "docs",
  instagram_task: "instagram",
  metric_definition: "metrics", metric_value: "metrics",
  org: "settings",
};

export function activityCategoryFor(action: string): ActivityCategory | null {
  return BY_SUBJECT[action.slice(0, action.indexOf(".") >>> 0)] ?? null;
}

/** emit() inserts the event, then the feed row. Allow the row to land up to
 *  this long after its event (slow pooled writes), and a little before it
 *  (clock skew between the two default(now()) stamps). */
export const PAIR_WINDOW_BEFORE_MS = 5_000;
export const PAIR_WINDOW_AFTER_MS = 1_000;

export interface PairableLog { id: number; actorId: number | null; timestamp: Date }
export interface PairableEvent { action: string; actorId: number | null; occurredAt: Date }

/**
 * Pair feed rows with the events that produced them; returns log id → category.
 *
 * Each event is used at most once, and rows are paired oldest first, each
 * taking the latest unused event from the same actor at or before it (else the
 * nearest one just after). That keeps a burst — one officer recording six
 * excuses in a second — lined up one-to-one instead of every row grabbing the
 * same event. Events with no feed category (billing, the assistant) are skipped:
 * they're emitted with { activity: false } and never had a row to pair with.
 *
 * A row with no partner gets no entry: rows that predate OperationalEvent, and
 * the handful written by logActivity() directly. No pill beats a guessed one.
 */
export function pairActivityCategories(
  logs: readonly PairableLog[],
  events: readonly PairableEvent[],
): Map<number, ActivityCategory> {
  const pool = events
    .map(e => ({ actorId: e.actorId, at: e.occurredAt.getTime(), category: activityCategoryFor(e.action), used: false }))
    .filter(e => e.category !== null)
    .sort((a, b) => a.at - b.at);
  const out = new Map<number, ActivityCategory>();

  for (const log of [...logs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.id - b.id)) {
    const t = log.timestamp.getTime();
    let best: (typeof pool)[number] | null = null;
    for (const e of pool) {
      if (e.used || e.actorId !== log.actorId) continue;
      if (e.at < t - PAIR_WINDOW_BEFORE_MS || e.at > t + PAIR_WINDOW_AFTER_MS) continue;
      // Prefer the closest event at or before the row; fall back to one after.
      if (!best) { best = e; continue; }
      const eBefore = e.at <= t, bestBefore = best.at <= t;
      if (eBefore !== bestBefore ? eBefore : Math.abs(t - e.at) < Math.abs(t - best.at)) best = e;
    }
    if (best) {
      best.used = true;
      out.set(log.id, best.category!);
    }
  }
  return out;
}
