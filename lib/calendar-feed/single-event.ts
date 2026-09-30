import ical from "ical-generator";
import type { PublishedItem } from "./projection";
import { calendarName, prodId, publishedFields } from "./render";

/**
 * One-off copies of a single event ("Add this event"), for people who won't
 * subscribe. They carry exactly the feed's published fields, so nothing the
 * feed withholds (notes, attendees) can leak through them. They never update;
 * the UI says so.
 */

// A copy's UID differs from the feed's, so importing one next to a subscribed
// calendar never collides with the live entry. It is stable, so importing the
// same event twice replaces rather than duplicates in clients that honour UIDs.
const copyUid = (orgId: number, eventId: number) => `chaptos-copy-${orgId}-${eventId}`;

export function singleEventIcs(value: PublishedItem, opts: { orgId: number; eventId: number; orgName: string; link: string; now?: Date }) {
  const calendar = ical({ name: calendarName(opts.orgName), prodId });
  const stamp = opts.now ?? new Date();
  calendar.createEvent({ id: copyUid(opts.orgId, opts.eventId), ...publishedFields(value, opts.link), stamp });
  return calendar.toString() + "\r\n";
}

const googleStamp = (d: Date, allDay: boolean) =>
  allDay ? d.toISOString().slice(0, 10).replace(/-/g, "") : d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Google's "create event" screen, prefilled. Works on phones, unlike subscribing. */
export function googleEventUrl(value: PublishedItem, link: string) {
  const f = publishedFields(value, link);
  // The fixed description already ends with the way back to ChaptOS.
  const params = new URLSearchParams({ action: "TEMPLATE", text: f.summary, dates: `${googleStamp(f.start, f.allDay)}/${googleStamp(f.end, f.allDay)}`, details: f.description });
  if (f.location) params.set("location", f.location);
  if (value.schedule.kind === "timed") params.set("ctz", value.schedule.timeZone);
  return `https://calendar.google.com/calendar/render?${params}`;
}
