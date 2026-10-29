import { on } from "../dispatch";
import { refreshCalendarFeed } from "@/lib/calendar-feed/worker";
// A low-latency wakeup only. Database triggers + the scheduled worker are the
// correctness path; emit failures/process restarts never lose durable work.
for (const action of ["calendar.created", "calendar.updated", "calendar.deleted", "task.created", "task.updated", "task.completed", "task.reopened", "task.deleted", "programming.created", "programming.updated", "programming.stage_changed", "programming.deleted", "party.created", "party.updated", "party.deleted", "service_event.created", "service_event.updated", "service_event.deleted"] as const) {
  on(action, async ctx => { if (process.env.CALENDAR_FEED_WORKER_ENABLED === "1") await refreshCalendarFeed(ctx.orgId); });
}
// Settings actions that enqueue durable work (a readiness check, turning on, a
// time-zone change that republishes typed times); wake the worker for them too.
const WAKING_ACTIONS: unknown[] = ["validate", "turnOn", "timeZone"];
on("org.config.updated", async (ctx, { metadata }) => {
  if (WAKING_ACTIONS.includes(metadata.calendarSubscriptionAction) && process.env.CALENDAR_FEED_WORKER_ENABLED === "1") await refreshCalendarFeed(ctx.orgId);
});
