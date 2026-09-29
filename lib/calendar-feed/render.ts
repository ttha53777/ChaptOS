import ical, { ICalEventStatus, ICalEventTransparency } from "ical-generator";
import { createHash } from "node:crypto";
import type { CalendarFeedItem } from "@/app/generated/prisma/client";
import type { PublishedItem } from "./projection";
import { endInstant } from "./schedule";

// Normalize CR/control characters before serialization. The serializer handles
// RFC TEXT escaping and UTF-8 octet-aware line folding (covered by tests).
const text = (value: string) => value.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
export function renderCalendar(name: string, slug: string, items: CalendarFeedItem[], origin: string, now = new Date()) {
  const calendar = ical({ name: text(name).replace(/\n/g, " ").replace(/[\\;,]/g, "\\$&"), prodId: { company: "ChaptOS", product: "Calendar subscriptions", language: "EN" } });
  const cutoff = now.getTime() - 90 * 86400_000;
  for (const row of [...items].sort((a, b) => a.uid.localeCompare(b.uid))) {
    if (!row.published) continue;
    const value = row.published as unknown as PublishedItem;
    if (row.cancelledAt ? !row.retainUntil || row.retainUntil < now : endInstant(value.schedule).getTime() < cutoff) continue;
    const allDay = value.schedule.kind === "allDay";
    calendar.createEvent({
      id: row.uid,
      start: new Date(allDay ? `${value.schedule.start}T00:00:00Z` : value.schedule.start),
      end: new Date(allDay ? `${value.schedule.end}T00:00:00Z` : value.schedule.end),
      allDay,
      summary: text(value.title),
      location: text(value.location),
      categories: [{ name: text(value.category) }],
      // This fixed notice is the only DESCRIPTION; source notes are never read.
      ...(value.timeUnconfirmed ? { description: "Time to be confirmed in ChaptOS" } : {}),
      url: value.url ?? `${origin}/${encodeURIComponent(slug)}/${row.sourceType === "task" ? "tasks" : "timeline"}?${row.sourceType === "task" ? "task" : "event"}=${row.sourceId}`,
      stamp: row.changedAt,
      lastModified: row.changedAt,
      sequence: row.revision,
      status: row.cancelledAt ? ICalEventStatus.CANCELLED : ICalEventStatus.CONFIRMED,
      transparency: value.transparent ? ICalEventTransparency.TRANSPARENT : ICalEventTransparency.OPAQUE,
    });
  }
  const body = calendar.toString() + "\r\n";
  return { body, etag: `"${createHash("sha256").update(body).digest("hex")}"`, bytes: Buffer.byteLength(body) };
}
