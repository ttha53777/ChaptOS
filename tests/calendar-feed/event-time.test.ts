import { describe, expect, it } from "vitest";
import { clock12, compareEvents, formatEventTime, isEventOver } from "@/lib/event-time";

describe("clock12", () => {
  it("converts 24-hour clocks", () => {
    expect(clock12("19:00")).toBe("7:00 PM");
    expect(clock12("00:30")).toBe("12:30 AM");
    expect(clock12("12:05")).toBe("12:05 PM");
    expect(clock12("9:15")).toBe("9:15 AM");
  });
  it("rejects anything that isn't a clock", () => {
    expect(clock12("7ish")).toBeNull();
    expect(clock12("25:00")).toBeNull();
  });
});

describe("formatEventTime", () => {
  const zone = "America/New_York";
  it("shows a start-only timed event in 12-hour", () => {
    expect(formatEventTime("19:00", { kind: "timed", start: "2026-10-01T23:00:00Z", timeZone: zone })).toBe("7:00 PM");
  });
  it("shares one meridiem across a same-half range", () => {
    expect(formatEventTime("19:00", { kind: "timed", start: "2026-10-01T23:00:00Z", end: "2026-10-02T01:30:00Z", timeZone: zone })).toBe("7:00 – 9:30 PM");
  });
  it("keeps both meridiems when the range crosses noon or midnight", () => {
    expect(formatEventTime("22:00", { kind: "timed", start: "2026-10-02T02:00:00Z", end: "2026-10-02T05:00:00Z", timeZone: zone })).toBe("10:00 PM – 1:00 AM");
  });
  it("uses the event's own zone, not the viewer's", () => {
    expect(formatEventTime(null, { kind: "timed", start: "2026-10-01T23:00:00Z", timeZone: "America/Los_Angeles" })).toBe("4:00 PM");
  });
  it("has no time for all-day events", () => {
    expect(formatEventTime(null, { kind: "allDay", start: "2026-10-01", end: "2026-10-02" })).toBeNull();
  });
  it("converts a legacy HH:MM column and keeps free text as written", () => {
    expect(formatEventTime("18:30")).toBe("6:30 PM");
    expect(formatEventTime("7:00 PM")).toBe("7:00 PM");
    expect(formatEventTime("after dinner")).toBe("after dinner");
    // No AM/PM typed: read as PM, the same as the calendar feed.
    expect(formatEventTime("7:30")).toBe("7:30 PM");
    expect(formatEventTime("11:45")).toBe("11:45 PM");
    expect(formatEventTime("12:30")).toBe("12:30 PM");
    expect(formatEventTime("8")).toBe("8:00 PM");
    expect(formatEventTime("07:30")).toBe("7:30 AM");
    expect(formatEventTime("  ", null)).toBeNull();
  });
});

describe("compareEvents", () => {
  const zone = "America/New_York";
  const timed = (id: number, date: string, start: string) => ({ id, date, schedule: { kind: "timed", start, timeZone: zone } });
  it("orders same-day events by start time, all-day first", () => {
    const evening = timed(1, "2026-10-01", "2026-10-01T23:00:00Z"); // 7pm
    const morning = timed(2, "2026-10-01", "2026-10-01T13:00:00Z"); // 9am
    const allDay = { id: 3, date: "2026-10-01", schedule: { kind: "allDay", start: "2026-10-01", end: "2026-10-02" } };
    const legacy = { id: 4, date: "2026-10-01", time: "12:30 PM" };
    expect([evening, morning, allDay, legacy].sort(compareEvents).map(e => e.id)).toEqual([3, 2, 4, 1]);
  });
  it("still orders by date first", () => {
    expect([timed(1, "2026-10-02", "2026-10-02T13:00:00Z"), timed(2, "2026-10-01", "2026-10-01T23:00:00Z")].sort(compareEvents).map(e => e.id)).toEqual([2, 1]);
  });
});

describe("isEventOver", () => {
  const zone = "America/New_York";
  const at = (iso: string) => new Date(iso);
  it("ends a timed event at its end, not at midnight", () => {
    const e = { date: "2026-10-01", schedule: { kind: "timed", start: "2026-10-01T13:00:00Z", end: "2026-10-01T14:00:00Z", timeZone: zone } };
    expect(isEventOver(e, at("2026-10-01T13:30:00Z"))).toBe(false);
    expect(isEventOver(e, at("2026-10-01T14:00:00Z"))).toBe(true);
  });
  it("gives a start-only event the default hour", () => {
    const e = { date: "2026-10-01", schedule: { kind: "timed", start: "2026-10-01T13:00:00Z", timeZone: zone } };
    expect(isEventOver(e, at("2026-10-01T13:59:00Z"))).toBe(false);
    expect(isEventOver(e, at("2026-10-01T14:00:00Z"))).toBe(true);
  });
  it("keeps an all-day event live through its last day", () => {
    const e = { date: "2026-10-01", schedule: { kind: "allDay", start: "2026-10-01", end: "2026-10-03" } };
    expect(isEventOver(e, new Date(2026, 9, 2, 23, 0))).toBe(false);
    expect(isEventOver(e, new Date(2026, 9, 3, 0, 1))).toBe(true);
  });
  it("falls back to the date for legacy rows", () => {
    expect(isEventOver({ date: "2026-10-01", time: "7ish" }, new Date(2026, 9, 1, 23, 0))).toBe(false);
    expect(isEventOver({ date: "2026-10-01", time: "7ish" }, new Date(2026, 9, 2, 0, 1))).toBe(true);
  });
});
