import { Temporal } from "@js-temporal/polyfill";
import type { CalendarFeedItem } from "@/app/generated/prisma/client";
import type { PublishedItem } from "./projection";
import { endInstant, type Schedule } from "./schedule";

export interface PreviewEntry { title: string; location: string; schedule: Schedule; deadline: boolean; timeUnconfirmed: boolean }

function startInstant(schedule: Schedule, orgZone: string | null): number {
  if (schedule.kind === "timed") return new Date(schedule.start).getTime();
  return Temporal.PlainDate.from(schedule.start).toZonedDateTime(orgZone ?? "UTC").epochMilliseconds;
}

/** The next entries a subscriber will see, read from the same published rows the
 *  feed serializes, so the setup preview can't promise something the feed omits. */
export function upcomingPreview(items: Pick<CalendarFeedItem, "published" | "cancelledAt" | "sourceType">[], orgZone: string | null, now = new Date(), limit = 3): PreviewEntry[] {
  return items
    .filter(row => row.published && !row.cancelledAt)
    .map(row => ({ row, value: row.published as unknown as PublishedItem }))
    .filter(({ value }) => endInstant(value.schedule).getTime() > now.getTime())
    .sort((a, b) => startInstant(a.value.schedule, orgZone) - startInstant(b.value.schedule, orgZone) || a.value.title.localeCompare(b.value.title))
    .slice(0, limit)
    .map(({ row, value }) => ({ title: value.title, location: value.location, schedule: value.schedule, deadline: row.sourceType === "task", timeUnconfirmed: value.timeUnconfirmed }));
}
