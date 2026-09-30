import { describe, it, expect, beforeEach } from "vitest";
import type { CalendarFeedItem } from "@/app/generated/prisma/client";
import { scheduleSchema, validDate, wallTimeToInstant, legacySchedule, endInstant, timeIsClear } from "@/lib/calendar-feed/schedule";
import { calendarProjection, taskProjection, cancellationRetention } from "@/lib/calendar-feed/projection";
import { renderCalendar } from "@/lib/calendar-feed/render";
import { googleEventUrl, singleEventIcs } from "@/lib/calendar-feed/single-event";
import { createCredential, decryptCredential, tokenMatches } from "@/lib/calendar-feed/credentials";

const now = new Date("2026-09-29T12:00:00Z");
const event = { title: "Chapter", date: "2026-10-01", time: null, location: "Room 1", category: "chapter", mandatory: false, schedule: null };
function item(overrides: Partial<CalendarFeedItem> = {}): CalendarFeedItem {
  return { id: 1, organizationId: 1, sourceType: "calendar", sourceId: 5, uid: "permanent-uid", published: calendarProjection(event) as never, contentHash: "hash", revision: 2, changedAt: new Date("2026-09-28T00:00:00Z"), cancelledAt: null, retainUntil: null, ...overrides };
}
describe("schedule validation", () => {
  it("rejects invalid dates and non-increasing exclusive ends", () => {
    expect(validDate("2026-02-29")).toBe(false);
    expect(validDate("2024-02-29")).toBe(true);
    expect(validDate("2026-04-31")).toBe(false);
    expect(scheduleSchema.safeParse({ kind: "allDay", start: "2026-10-01", end: "2026-10-01" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ kind: "timed", start: "2026-10-01T01:00:00Z", end: "2026-10-01T01:00:00.001Z", timeZone: "America/New_York" }).success).toBe(true);
  });
  it("rejects DST gaps and requires an explicit valid offset for repeated times", () => {
    expect(() => wallTimeToInstant("2026-03-08T02:30", "America/New_York")).toThrow();
    expect(() => wallTimeToInstant("2026-11-01T01:30", "America/New_York")).toThrow();
    expect(wallTimeToInstant("2026-11-01T01:30", "America/New_York", "-04:00")).toBe("2026-11-01T05:30:00Z");
    expect(wallTimeToInstant("2026-11-01T01:30", "America/New_York", "-05:00")).toBe("2026-11-01T06:30:00Z");
    expect(() => wallTimeToInstant("2026-11-01T01:30", "America/New_York", "-06:00")).toThrow();
  });
  it("supports overnight instants and reads unsaved times from the event's typed time", () => {
    expect(scheduleSchema.safeParse({ kind: "timed", start: "2026-10-01T23:00:00Z", end: "2026-10-02T02:00:00Z", timeZone: "Europe/London" }).success).toBe(true);
    const zone = "America/New_York";
    // No time: all-day, nothing to confirm.
    expect(legacySchedule("2026-10-01", null, zone)).toEqual({ schedule: { kind: "allDay", start: "2026-10-01", end: "2026-10-02" }, issue: null });
    expect(legacySchedule("2026-10-01", "All Day", zone)).toEqual({ schedule: { kind: "allDay", start: "2026-10-01", end: "2026-10-02" }, issue: null });
    // A readable time publishes at that time; no end means the default length.
    expect(legacySchedule("2026-10-01", "7:00 PM", zone)).toEqual({ schedule: { kind: "timed", start: "2026-10-01T23:00:00Z", timeZone: zone }, issue: null });
    expect(legacySchedule("2026-10-01", "7-9pm", zone).schedule).toEqual({ kind: "timed", start: "2026-10-01T23:00:00Z", end: "2026-10-02T01:00:00Z", timeZone: zone });
    expect(legacySchedule("2026-10-01", "9pm-1am", zone).schedule).toEqual({ kind: "timed", start: "2026-10-02T01:00:00Z", end: "2026-10-02T05:00:00Z", timeZone: zone });
    // Unreadable text, no org zone, or a skipped wall time: all-day, to be confirmed.
    const tbc = { schedule: { kind: "allDay", start: "2026-10-01", end: "2026-10-02" }, issue: "Time to be confirmed in ChaptOS" };
    expect(legacySchedule("2026-10-01", "7ish", zone)).toEqual(tbc);
    expect(legacySchedule("2026-10-01", "after dinner", zone)).toEqual(tbc);
    // A time with no AM/PM is read as PM.
    expect(legacySchedule("2026-10-01", "7:30", zone).schedule).toEqual({ kind: "timed", start: "2026-10-01T23:30:00Z", timeZone: zone });
    expect(legacySchedule("2026-10-01", "8", zone).schedule).toEqual({ kind: "timed", start: "2026-10-02T00:00:00Z", timeZone: zone });
    expect(legacySchedule("2026-10-01", "12:15", zone).schedule).toEqual({ kind: "timed", start: "2026-10-01T16:15:00Z", timeZone: zone });
    expect(legacySchedule("2026-10-01", "7:00 PM")).toEqual(tbc);
    expect(legacySchedule("2026-03-08", "2:30 AM", zone).issue).toBe("Time to be confirmed in ChaptOS");
    expect(legacySchedule("yesterday", "7 PM", zone).schedule).toBeNull();
  });
  it("only accepts new times that say AM or PM (or are 24-hour)", () => {
    for (const ok of ["7:30 PM", "7pm", "7-9pm", "19:00", "07:30", "All Day", ""]) expect(timeIsClear(ok), ok).toBe(true);
    for (const bad of ["7:30", "8", "11:45", "7ish", "after dinner"]) expect(timeIsClear(bad), bad).toBe(false);
  });
  it("accepts a timed event with only a start, which ends an hour later where a calendar needs an end", () => {
    const startOnly = scheduleSchema.safeParse({ kind: "timed", start: "2026-10-01T23:00:00Z", timeZone: "America/New_York" });
    expect(startOnly.success).toBe(true);
    expect(endInstant(startOnly.data!)).toEqual(new Date("2026-10-02T00:00:00Z"));
    expect(scheduleSchema.safeParse({ kind: "timed", start: "2026-10-01T23:00:00Z", end: "2026-10-01T23:00:00Z", timeZone: "America/New_York" }).success).toBe(false);
  });
});
describe("allowlisted projection and serialization", () => {
  it("publishes confirmed/done stages, excludes legacy duplicate deadlines", () => {
    expect(calendarProjection(event, "planning")).toBeNull();
    expect(calendarProjection(event, "idea")).toBeNull();
    expect(calendarProjection(event, "confirmed")).not.toBeNull();
    expect(calendarProjection(event, "done")).not.toBeNull();
    expect(calendarProjection({ ...event, category: "deadline" })).toBeNull();
  });
  it("uses deterministic DATE bounds and persisted stamps across fetches", () => {
    const first = renderCalendar("Org", "org", [item()], "https://example.com", now);
    const second = renderCalendar("Org", "org", [item()], "https://example.com", new Date(now.getTime() + 10000));
    expect(first).toEqual(second);
    expect(first.body).toContain("DTSTART;VALUE=DATE:20261001\r\n");
    expect(first.body).toContain("DTEND;VALUE=DATE:20261002\r\n");
    expect(first.body).toContain("DTSTAMP:20260928T000000Z");
    expect(first.body).toContain("LAST-MODIFIED:20260928T000000Z");
    expect(first.body).toContain("SEQUENCE:2");
    expect(first.body).not.toMatch(/METHOD:|ATTENDEE|ORGANIZER|RSVP/);
  });
  it("emits hourly refresh hints once, at calendar level", () => {
    const { body } = renderCalendar("Org", "org", [item()], "https://example.com", now);
    expect(body.match(/\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n/g)).toHaveLength(1);
    expect(body.match(/\r\nX-PUBLISHED-TTL:PT1H\r\n/g)).toHaveLength(1);
    expect(body.indexOf("REFRESH-INTERVAL")).toBeLessThan(body.indexOf("BEGIN:VEVENT"));
  });
  it("escapes property injection, folds Unicode by octet, never leaks notes", () => {
    const published = calendarProjection({ ...event, title: "🎉".repeat(70) + "\r\nATTENDEE:evil;comma,slash\\", description: "SECRET NOTES", notesSummary: "SECRET SUMMARY" } as typeof event)!;
    const { body } = renderCalendar("Org\r\nATTENDEE:evil", "org", [item({ published: published as never })], "https://example.com", now);
    expect(body).not.toMatch(/\r\nATTENDEE:/);
    expect(body).not.toContain("SECRET");
    expect(body.replace(/\r\n /g, "")).toContain("\\nATTENDEE:evil");
    for (const line of body.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(body).not.toContain("�");
    expect(body.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
  it("renders timed events in UTC and open dated tasks transparently; completed tasks aren't published", () => {
    const published = calendarProjection({ ...event, schedule: { kind: "timed", start: "2026-10-01T23:00:00Z", end: "2026-10-02T02:00:00Z", timeZone: "Europe/London" } });
    const task = taskProjection({ title: "Apply", dueDate: "2026-10-02", status: "open" });
    const { body } = renderCalendar("Org", "org", [item({ published: published as never }), item({ id: 2, uid: "task-uid", sourceType: "task", published: task as never })], "https://example.com", now);
    expect(body).toContain("DTSTART:20261001T230000Z");
    expect(body).toContain("DTEND:20261002T020000Z");
    expect(body).toContain("SUMMARY:Deadline: Apply");
    expect(body).toContain("TRANSP:TRANSPARENT");
    expect(taskProjection({ title: "Apply", dueDate: null, status: "open" })).toBeNull();
    expect(taskProjection({ title: "Apply", dueDate: "2026-10-02", status: "done" })).toBeNull();
  });
  it("describes entries only with fixed lines: required, unconfirmed, and the way back", () => {
    const description = (value: object, overrides: Partial<CalendarFeedItem> = {}) =>
      renderCalendar("Org", "org", [item({ published: value as never, ...overrides })], "https://example.com", now).body
        .replace(/\r\n /g, "").split("\r\n").find(l => l.startsWith("DESCRIPTION:"));
    const required = calendarProjection({ ...event, mandatory: true, description: "SECRET NOTES", notesSummary: "SECRET SUMMARY" } as typeof event)!;
    expect(required.mandatory).toBe(true);
    expect(description(required)).toBe("DESCRIPTION:Required · attendance is taken\\nOpen in ChaptOS: https://example.com/org/timeline?event=5");
    // Optional events omit the key entirely, so rows published before it existed keep their hash.
    expect(calendarProjection(event)).not.toHaveProperty("mandatory");
    expect(description(calendarProjection(event)!)).toBe("DESCRIPTION:Open in ChaptOS: https://example.com/org/timeline?event=5");
    expect(description(calendarProjection({ ...event, mandatory: true, time: "after dinner" })!))
      .toBe("DESCRIPTION:Required · attendance is taken\\nTime to be confirmed in ChaptOS\\nOpen in ChaptOS: https://example.com/org/timeline?event=5");
    // The stored worker URL wins, and URL is still emitted alongside.
    const stored = { ...calendarProjection(event)!, url: "https://app.test/org/timeline?event=5" };
    const body = renderCalendar("Org", "org", [item({ published: stored as never })], "https://example.com", now).body.replace(/\r\n /g, "");
    expect(body).toContain("DESCRIPTION:Open in ChaptOS: https://app.test/org/timeline?event=5");
    expect(body).toContain("URL;VALUE=URI:https://app.test/org/timeline?event=5");
    const task = taskProjection({ title: "Apply", dueDate: "2026-10-02", status: "open" })!;
    expect(description(task, { sourceType: "task", sourceId: 9 })).toBe("DESCRIPTION:Open in ChaptOS: https://example.com/org/tasks?task=9");
  });
  it("retains cancellations through the later retention boundary and excludes expired past entries", () => {
    const published = calendarProjection(event)!;
    const retainUntil = cancellationRetention(published, now);
    expect(retainUntil.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    const canceled = item({ cancelledAt: now, retainUntil });
    expect(renderCalendar("Org", "org", [canceled], "https://example.com", now).body).toContain("STATUS:CANCELLED");
    expect(renderCalendar("Org", "org", [canceled], "https://example.com", new Date("2027-01-01")).body).not.toContain("BEGIN:VEVENT");
    expect(renderCalendar("Org", "org", [item()], "https://example.com", new Date("2027-06-01")).body).not.toContain("BEGIN:VEVENT");
  });
});
describe("single-event copies (Add this event)", () => {
  const timed = calendarProjection({ ...event, location: "Room 1", schedule: { kind: "timed", start: "2026-10-01T23:00:00Z", end: "2026-10-02T02:00:00Z", timeZone: "America/New_York" } })!;
  const link = "https://example.com/org/timeline?event=5";
  const vevent = (body: string) => body.replace(/\r\n /g, "").split("\r\n").filter(l => /^(DTSTART|DTEND|SUMMARY|LOCATION|CATEGORIES|TRANSP|DESCRIPTION)[:;]/.test(l)).sort();
  it("carries exactly the feed's published fields, under its own stable UID", () => {
    for (const value of [calendarProjection(event)!, timed, calendarProjection({ ...event, time: "after dinner" })!]) {
      const feed = renderCalendar("Org", "org", [item({ published: value as never })], "https://example.com", now).body;
      const copy = singleEventIcs(value, { orgId: 1, eventId: 5, orgName: "Org", link, now });
      expect(vevent(copy)).toEqual(vevent(feed));
      expect(copy).toContain("UID:chaptos-copy-1-5");
      expect(copy).not.toContain("permanent-uid");
      // A one-off copy is not a subscription: no refresh hints.
      expect(copy).not.toMatch(/REFRESH-INTERVAL|X-PUBLISHED-TTL/);
    }
  });
  it("never includes notes, and escapes hostile titles", () => {
    const value = calendarProjection({ ...event, title: "Mixer\r\nATTENDEE:evil", description: "SECRET NOTES", notesSummary: "SECRET SUMMARY" } as typeof event)!;
    const copy = singleEventIcs(value, { orgId: 1, eventId: 5, orgName: "Org", link, now });
    expect(copy).not.toContain("SECRET");
    expect(copy).not.toMatch(/\r\nATTENDEE:/);
    expect(googleEventUrl(value, link)).not.toContain("SECRET");
  });
  it("builds Google's create-event link with the same times, and the way back in the details", () => {
    const url = new URL(googleEventUrl(timed, link));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Chapter");
    expect(url.searchParams.get("dates")).toBe("20261001T230000Z/20261002T020000Z");
    expect(url.searchParams.get("ctz")).toBe("America/New_York");
    expect(url.searchParams.get("location")).toBe("Room 1");
    expect(url.searchParams.get("details")).toBe(`Open in ChaptOS: ${link}`);
    const allDay = new URL(googleEventUrl(calendarProjection({ ...event, time: "after dinner" })!, link));
    expect(allDay.searchParams.get("dates")).toBe("20261001/20261002");
    expect(allDay.searchParams.get("details")).toBe(`Time to be confirmed in ChaptOS\nOpen in ChaptOS: ${link}`);
    expect(allDay.searchParams.has("ctz")).toBe(false);
  });
  it("publishes a start-only event as a one-hour block in the feed, the copy and the Google link", () => {
    const startOnly = calendarProjection({ ...event, schedule: { kind: "timed", start: "2026-10-01T23:00:00Z", timeZone: "America/New_York" } })!;
    const feed = renderCalendar("Org", "org", [item({ published: startOnly as never })], "https://example.com", now).body;
    expect(feed).toContain("DTSTART:20261001T230000Z");
    expect(feed).toContain("DTEND:20261002T000000Z");
    expect(vevent(singleEventIcs(startOnly, { orgId: 1, eventId: 5, orgName: "Org", link, now }))).toEqual(vevent(feed));
    expect(new URL(googleEventUrl(startOnly, link)).searchParams.get("dates")).toBe("20261001T230000Z/20261002T000000Z");
  });
});
describe("credential encryption", () => {
  beforeEach(() => { process.env.CALENDAR_FEED_KEY = "a".repeat(64); });
  it("uses independent 256-bit secrets, authenticated encryption bound to public ID, and constant-sized digest checks", () => {
    const first = createCredential("feed-one");
    const second = createCredential("feed-one");
    const token = decryptCredential("feed-one", first.tokenCiphertext);
    expect(Buffer.from(token, "base64url").length).toBe(32);
    expect(first.tokenCiphertext).not.toContain(token);
    expect(first.tokenDigest).not.toBe(second.tokenDigest);
    expect(tokenMatches(token, first.tokenDigest)).toBe(true);
    expect(tokenMatches(token, second.tokenDigest)).toBe(false);
    expect(tokenMatches(token, null)).toBe(false);
    expect(() => decryptCredential("feed-two", first.tokenCiphertext)).toThrow();
  });
});
