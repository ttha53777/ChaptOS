import { describe, it, expect } from "vitest";
import { moveSchedule, parseLegacyTime, resolveWallTime } from "@/lib/calendar-feed/schedule";

const ny = (start: string, end: string) => ({ kind: "timed" as const, start, end, timeZone: "America/New_York" });

describe("resolveWallTime", () => {
  it("classifies ordinary, skipped and repeated local times", () => {
    expect(resolveWallTime("2026-10-01T19:00", "America/New_York")).toEqual({ kind: "ok", instant: "2026-10-01T23:00:00Z" });
    expect(resolveWallTime("2026-03-08T02:30", "America/New_York")).toEqual({ kind: "gap" });
    expect(resolveWallTime("2026-11-01T01:30", "America/New_York")).toEqual({ kind: "ambiguous", offsets: ["-04:00", "-05:00"] });
    expect(resolveWallTime("2026-11-01T01:30", "America/New_York", "-05:00")).toEqual({ kind: "ok", instant: "2026-11-01T06:30:00Z" });
    // A stale offset from an earlier choice re-classifies rather than failing.
    expect(resolveWallTime("2026-10-01T19:00", "America/New_York", "-05:00")).toEqual({ kind: "ok", instant: "2026-10-01T23:00:00Z" });
  });
});

describe("moveSchedule", () => {
  it("keeps local wall times and length across DST, and all-day spans", () => {
    expect(moveSchedule(ny("2027-03-11T00:00:00Z", "2027-03-11T02:00:00Z"), "2027-03-20")).toEqual(ny("2027-03-20T23:00:00Z", "2027-03-21T01:00:00Z"));
    // Overnight stays overnight.
    expect(moveSchedule(ny("2027-01-02T03:00:00Z", "2027-01-02T06:00:00Z"), "2027-01-08")).toEqual(ny("2027-01-09T03:00:00Z", "2027-01-09T06:00:00Z"));
    expect(moveSchedule({ kind: "allDay", start: "2027-01-01", end: "2027-01-04" }, "2027-02-01")).toEqual({ kind: "allDay", start: "2027-02-01", end: "2027-02-04" });
  });
  it("returns the same schedule for the same date and null onto a skipped hour", () => {
    const s = ny("2027-03-07T07:30:00Z", "2027-03-07T08:30:00Z");
    expect(moveSchedule(s, "2027-03-07")).toBe(s);
    expect(moveSchedule(s, "2027-03-14")).toBeNull();
  });
});

describe("parseLegacyTime", () => {
  it.each([
    ["7:30 PM", { start: "19:30" }],
    ["7pm", { start: "19:00" }],
    ["7 p.m.", { start: "19:00" }],
    ["19:00", { start: "19:00" }],
    ["09:15", { start: "09:15" }],
    ["7-9pm", { start: "19:00", end: "21:00" }],
    ["11-1pm", { start: "11:00", end: "13:00" }],
    ["6:30pm - 10:00pm", { start: "18:30", end: "22:00" }],
  ])("reads %s", (text, expected) => {
    expect(parseLegacyTime(text)).toEqual({ end: undefined, ...expected });
  });
  it.each(["TBD", "after dinner", "7", "10:30", "7 at night", "12:75pm"])("leaves unclear text %s alone", text => {
    expect(parseLegacyTime(text).start).toBeUndefined();
  });
  it("skips digits inside longer numbers and reads the real time", () => {
    expect(parseLegacyTime("Room 204 at 7pm")).toEqual({ start: "19:00", end: undefined });
  });
});
