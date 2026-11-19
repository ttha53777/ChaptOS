import type { RequestContext } from "@/lib/context";
import { hydrateBrotherAvatars, publicBrother } from "@/lib/brother-avatar";
import { isoWeekBounds } from "@/lib/dates";
import { duesToday } from "@/lib/dues-ledger";
import { hasPermission } from "@/lib/permissions";
import { resolveTrackedMetrics } from "@/lib/tracked-metrics";
import type { DisabledFeatures } from "@/lib/workflow-features";
// A read model: it composes other aggregates' READ functions into the web
// dashboard's inputs for the app's Home tab, one round trip instead of a dozen.
// It never writes and never calls a service that emits (see home-service.ts).
import { listVisibleBrothers } from "@/lib/services/brother-service"; // lint-modules:ignore (read-model composition)
import { listTasks } from "@/lib/services/task-service"; // lint-modules:ignore (read-model composition)
import { listPolls } from "@/lib/services/poll-service"; // lint-modules:ignore (read-model composition)
import { listCalendar } from "@/lib/services/calendar-service"; // lint-modules:ignore (read-model composition)
import { getTreasurySummary } from "@/lib/services/treasury-summary-service"; // lint-modules:ignore (read-model composition)
import { listReimbursements } from "@/lib/services/reimbursement-service"; // lint-modules:ignore (read-model composition)
import { listRecentActivity } from "@/lib/services/activity-service"; // lint-modules:ignore (read-model composition)
import { listDocs } from "@/lib/services/doc-service"; // lint-modules:ignore (read-model composition)
import { getMetricSnapshot } from "@/lib/services/metric-value-service"; // lint-modules:ignore (read-model composition)
import { getDuesBoard } from "@/lib/services/dues-charge-service"; // lint-modules:ignore (read-model composition)
import { getLiveCheckIn } from "@/lib/services/attendance-service"; // lint-modules:ignore (read-model composition)
import { listInstagramTasks } from "@/lib/services/instagram-service"; // lint-modules:ignore (read-model composition)

/** The Activity card's glance shows a handful; the spotlight pages on its own. */
const ACTIVITY_COUNT = 6;
/** This week plus what's coming: enough for the agenda and Up next. */
const CALENDAR_TAKE = 60;

const none = async <T,>(v: T) => v;

/**
 * GET /api/dashboard. `today` is the phone's local date; without it, the chapter's.
 * Reads run two at a time: the pg pool is 2 connections per instance (see
 * home-service.ts), so a wider fan-out would only queue.
 */
export async function getDashboard(ctx: RequestContext, today?: string) {
  const [org, config] = await Promise.all([
    ctx.db.organization.findFirst({ select: { timeZone: true } }),
    ctx.db.organizationConfig.find(),
  ]);
  const day = today ?? duesToday(org?.timeZone);
  const wf = new Set(config?.enabledWorkflows ?? []);
  const tracked = resolveTrackedMetrics((config?.disabledFeatures ?? {}) as DisabledFeatures);
  const canTreasury = ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, "MANAGE_TREASURY");
  const { start } = isoWeekBounds(new Date(`${day}T00:00:00`));

  const [brothers, tasks] = await Promise.all([
    listVisibleBrothers(ctx).then(hydrateBrotherAvatars),
    wf.has("tasks") ? listTasks(ctx) : none([]),
  ]);
  const [polls, calendar] = await Promise.all([
    listPolls(ctx, { mine: true, status: "open" }),
    listCalendar(ctx, { upcoming: { from: start, take: CALENDAR_TAKE } }),
  ]);
  const [treasury, reimbursements] = await Promise.all([
    wf.has("finance") ? getTreasurySummary(ctx) : none(null),
    wf.has("finance") && canTreasury ? listReimbursements(ctx) : none([]),
  ]);
  const [activity, docs] = await Promise.all([
    listRecentActivity(ctx, { limit: ACTIVITY_COUNT }),
    wf.has("docs") ? listDocs(ctx) : none([]),
  ]);
  const [announcement, metrics] = await Promise.all([
    ctx.db.chapterAnnouncement.findFirst({ where: {} }),
    getMetricSnapshot(ctx),
  ]);
  const [dues, liveCheckIn] = await Promise.all([
    tracked.duesOwed ? getDuesBoard(ctx).then(b => b.members) : none([]),
    getLiveCheckIn(ctx),
  ]);
  const [parties, instagram] = await Promise.all([
    wf.has("parties")
      ? ctx.db.partyEvent.findMany({ where: { date: { gte: start } }, orderBy: { date: "asc" }, select: { id: true, name: true, date: true } })
      : none([]),
    wf.has("communications") ? listInstagramTasks(ctx) : none([]),
  ]);

  return {
    today: day,
    brothers: brothers.map(publicBrother),
    tasks,
    polls,
    calendar,
    treasury,
    reimbursements,
    activity,
    docs,
    announcement: announcement
      ? {
          title: announcement.title, body: announcement.body, ctaLabel: announcement.ctaLabel, ctaUrl: announcement.ctaUrl,
          authorName: announcement.authorName, updatedAt: announcement.updatedAt.toISOString(),
        }
      : null,
    metrics,
    duesStandings: dues,
    liveCheckIn,
    parties,
    instagram: instagram.map(t => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, postedDate: t.postedDate })),
  };
}
