import type { FeedContext } from "@/lib/auth/calendar-feed";
import type { RequestContext } from "@/lib/context";
import { DomainError, NotFoundError, ValidationError } from "@/lib/errors";
import { feedOrigin, feedRolloutAllowed } from "@/lib/calendar-feed/config";
import { entryLink, renderCalendar } from "@/lib/calendar-feed/render";
import { calendarProjection } from "@/lib/calendar-feed/projection";
import { googleEventUrl, singleEventIcs } from "@/lib/calendar-feed/single-event";

export async function readCalendarFeed(ctx: FeedContext) {
  const { subscription, work, organization, items } = await ctx.db.read();
  // Recheck in the same consistent snapshot as content, before ETag handling.
  if (!subscription?.enabled || !subscription.validatedAt || subscription.generation !== ctx.generation || subscription.tokenDigest !== ctx.tokenDigest || !feedRolloutAllowed(ctx.orgId)) throw new NotFoundError("Calendar feed");
  if (!work?.processedAt || work.version !== work.appliedVersion || work.failedAt) throw new DomainError("INTERNAL", "Calendar feed is updating; retry later", 503);
  return renderCalendar(organization.name, organization.slug, items, feedOrigin());
}

/**
 * "Add this event": a one-off copy of one timeline event, built from the same
 * projection the feed publishes. Whatever the feed would leave out (a draft
 * programming stage, a legacy deadline row, an unreadable date) is refused here
 * too. Works whether or not the org's subscription is on: it's the member's own
 * copy of an event they can already see.
 */
type ExportRow = { id: number; title: string; date: string; time: string | null; location: string | null; category: string; mandatory: boolean; schedule: unknown; programmingEvent: { stage: string; organizationId: number } | null };
export async function exportCalendarEvent(ctx: RequestContext, id: number, to: "google" | "ics", requestOrigin: string) {
  const [row, organization] = await Promise.all([
    // The scoped wrapper's return type drops the select; the runtime shape is this.
    ctx.db.calendarEvent.findFirst({ where: { id }, select: { id: true, title: true, date: true, time: true, location: true, category: true, mandatory: true, schedule: true, programmingEvent: { select: { stage: true, organizationId: true } } } }) as Promise<ExportRow | null>,
    ctx.db.organization.findFirst({ select: { name: true, slug: true } }),
  ]);
  if (!row || !organization) throw new NotFoundError("Event");
  // Same guard as the worker: a cross-org programming link is never published.
  if (row.programmingEvent && row.programmingEvent.organizationId !== ctx.orgId) throw new NotFoundError("Event");
  const published = calendarProjection(row, row.programmingEvent?.stage);
  if (!published) throw new ValidationError("This event can't be added to a calendar yet");
  let origin = requestOrigin;
  try { origin = feedOrigin(); } catch { /* unconfigured server: link back to where the member is */ }
  const link = entryLink(origin, organization.slug, "calendar", row.id);
  if (to === "google") return { kind: "google" as const, url: googleEventUrl(published, link) };
  const filename = `${published.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "event"}.ics`;
  return { kind: "ics" as const, filename, body: singleEventIcs(published, { orgId: ctx.orgId, eventId: row.id, orgName: organization.name, link }) };
}
