import { describe, it, expect, beforeEach } from "vitest";
import type { CalendarFeedItem } from "@/app/generated/prisma/client";
import { scheduleSchema, validDate, wallTimeToInstant, legacySchedule } from "@/lib/calendar-feed/schedule";
import { calendarProjection, taskProjection, cancellationRetention } from "@/lib/calendar-feed/projection";
import { renderCalendar } from "@/lib/calendar-feed/render";
import { createCredential, decryptCredential, tokenMatches } from "@/lib/calendar-feed/credentials";

const now = new Date("2026-09-29T12:00:00Z");
const event = { title: "Chapter", date: "2026-10-01", time: null, location: "Room 1", category: "chapter", schedule: null };
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
  it("supports overnight instants and refuses to infer legacy times", () => {
    expect(scheduleSchema.safeParse({ kind: "timed", start: "2026-10-01T23:00:00Z", end: "2026-10-02T02:00:00Z", timeZone: "Europe/London" }).success).toBe(true);
    expect(legacySchedule("2026-10-01", "after dinner")).toEqual({ schedule: { kind: "allDay", start: "2026-10-01", end: "2026-10-02" }, issue: "Time to be confirmed in ChaptOS" });
    expect(legacySchedule("yesterday", "7 PM").schedule).toBeNull();
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
  it("renders timed events in UTC and all dated tasks transparently including done", () => {
    const published = calendarProjection({ ...event, schedule: { kind: "timed", start: "2026-10-01T23:00:00Z", end: "2026-10-02T02:00:00Z", timeZone: "Europe/London" } });
    const task = taskProjection({ title: "Apply", dueDate: "2026-10-02", status: "done" });
    const { body } = renderCalendar("Org", "org", [item({ published: published as never }), item({ id: 2, uid: "task-uid", sourceType: "task", published: task as never })], "https://example.com", now);
    expect(body).toContain("DTSTART:20261001T230000Z");
    expect(body).toContain("DTEND:20261002T020000Z");
    expect(body).toContain("SUMMARY:Deadline: [Done] Apply");
    expect(body).toContain("TRANSP:TRANSPARENT");
    expect(taskProjection({ title: "Apply", dueDate: null, status: "open" })).toBeNull();
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
