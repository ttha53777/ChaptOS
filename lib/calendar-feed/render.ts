import ical, { ICalEventStatus, ICalEventTransparency } from "ical-generator";
import { createHash } from "node:crypto";
import type { CalendarFeedItem } from "@/app/generated/prisma/client";
import type { PublishedItem } from "./projection";
import { endInstant } from "./schedule";

// Normalize CR/control characters before serialization. The serializer handles
// RFC TEXT escaping and UTF-8 octet-aware line folding (covered by tests).
export const text = (value: string) => value.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
export const calendarName = (name: string) => text(name).replace(/\n/g, " ").replace(/[\\;,]/g, "\\$&");
export const prodId = { company: "ChaptOS", product: "Calendar subscriptions", language: "EN" };
/** Where an entry opens in ChaptOS. */
export const entryLink = (origin: string, slug: string, sourceType: string, sourceId: number) =>
  `${origin}/${encodeURIComponent(slug)}/${sourceType === "task" ? "tasks" : "timeline"}?${sourceType === "task" ? "task" : "event"}=${sourceId}`;
/**
 * The only DESCRIPTION an entry ever carries: fixed, app-controlled lines. Source
 * notes and descriptions are never read, so the published-field allowlist holds.
 * The link repeats URL because Google doesn't show that property.
 */
export function fixedDescription(value: PublishedItem, link: string) {
  return [
    value.mandatory && "Required · attendance is taken",
    value.timeUnconfirmed && "Time to be confirmed in ChaptOS",
    `Open in ChaptOS: ${link}`,
  ].filter(Boolean).join("\n");
}
/** The published fields as calendar properties: shared by the feed and one-off copies. */
export function publishedFields(value: PublishedItem, link: string) {
  const allDay = value.schedule.kind === "allDay";
  return {
    start: new Date(allDay ? `${value.schedule.start}T00:00:00Z` : value.schedule.start),
    end: new Date(allDay ? `${value.schedule.end}T00:00:00Z` : value.schedule.end),
    allDay,
    summary: text(value.title),
    location: text(value.location),
    categories: [{ name: text(value.category) }],
    description: fixedDescription(value, link),
    url: link,
    transparency: value.transparent ? ICalEventTransparency.TRANSPARENT : ICalEventTransparency.OPAQUE,
  };
}
// Refresh hint: `ttl` emits REFRESH-INTERVAL;VALUE=DURATION and X-PUBLISHED-TTL.
// Apple honours it; Google ignores it and refreshes on its own schedule.
const REFRESH_SECONDS = 3600;
export function renderCalendar(name: string, slug: string, items: CalendarFeedItem[], origin: string, now = new Date()) {
  const calendar = ical({ name: calendarName(name), prodId, ttl: REFRESH_SECONDS });
  const cutoff = now.getTime() - 90 * 86400_000;
  for (const row of [...items].sort((a, b) => a.uid.localeCompare(b.uid))) {
    if (!row.published) continue;
    const value = row.published as unknown as PublishedItem;
    if (row.cancelledAt ? !row.retainUntil || row.retainUntil < now : endInstant(value.schedule).getTime() < cutoff) continue;
    calendar.createEvent({
      id: row.uid,
      ...publishedFields(value, value.url ?? entryLink(origin, slug, row.sourceType, row.sourceId)),
      stamp: row.changedAt,
      lastModified: row.changedAt,
      sequence: row.revision,
      status: row.cancelledAt ? ICalEventStatus.CANCELLED : ICalEventStatus.CONFIRMED,
    });
  }
  const body = calendar.toString() + "\r\n";
  return { body, etag: `"${createHash("sha256").update(body).digest("hex")}"`, bytes: Buffer.byteLength(body) };
}
