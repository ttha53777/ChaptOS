import { describe, it, expect } from "vitest";
import { durationLabel, initialSchedule, scheduleFromValue, suspectLength, type ScheduleValue } from "@/app/components/timeline/ScheduleFields";

const value = (patch: Partial<ScheduleValue>): ScheduleValue => ({
  mode: "timed", date: "2026-10-01", startTime: "", endTime: "", lastDay: "", legacyTime: "", zone: "America/New_York", startOffset: "", endOffset: "", ...patch,
});

describe("scheduleFromValue", () => {
  it("saves a start with no end", () => {
    expect(scheduleFromValue(value({ startTime: "19:00" }))).toEqual({ schedule: { kind: "timed", start: "2026-10-01T23:00:00Z", timeZone: "America/New_York" } });
  });
  it("saves a start and end, including one that ends the next day", () => {
    expect(scheduleFromValue(value({ startTime: "19:00", endTime: "21:00" }))).toEqual({ schedule: { kind: "timed", start: "2026-10-01T23:00:00Z", end: "2026-10-02T01:00:00Z", timeZone: "America/New_York" } });
    expect(scheduleFromValue(value({ startTime: "22:00", endTime: "01:00" }))).toEqual({ schedule: { kind: "timed", start: "2026-10-02T02:00:00Z", end: "2026-10-02T05:00:00Z", timeZone: "America/New_York" } });
  });
  it("rejects an end equal to the start instead of saving a 24-hour event", () => {
    expect(scheduleFromValue(value({ startTime: "19:00", endTime: "19:00" }))).toEqual({ error: "The end time is the same as the start. Clear it or pick a later time." });
  });
  it("needs a start, and ignores an end left behind when the start was cleared", () => {
    expect(scheduleFromValue(value({}))).toEqual({ error: "Add a start time, or make it an all-day event." });
    expect(scheduleFromValue(value({ endTime: "21:00" }))).toEqual({ error: "Add a start time, or make it an all-day event." });
  });
  it("round-trips a start-only schedule back into the editor with a blank end", () => {
    const saved = { kind: "timed" as const, start: "2026-10-01T23:00:00Z", timeZone: "America/New_York" };
    expect(initialSchedule(saved, { date: "", isNew: false })).toMatchObject({ mode: "timed", startTime: "19:00", endTime: "", endOffset: "" });
  });
});

describe("durationLabel", () => {
  it("reads as hours and minutes, overnight included", () => {
    expect(durationLabel("19:00", "21:00")).toBe("2 hr");
    expect(durationLabel("19:00", "20:30")).toBe("1 hr 30 min");
    expect(durationLabel("19:00", "19:45")).toBe("45 min");
    expect(durationLabel("22:00", "01:00")).toBe("3 hr");
  });
});

describe("suspectLength", () => {
  it("flags a likely AM/PM slip and suggests the other meridiem", () => {
    expect(suspectLength("19:00", "09:00")).toEqual({ hours: 14, suggest: "21:00" });
  });
  it("flags a long overnight span it can't fix with a meridiem swap", () => {
    expect(suspectLength("08:00", "07:00")).toEqual({ hours: 23, suggest: "19:00" });
    expect(suspectLength("18:00", "13:00")).toEqual({ hours: 19, suggest: null });
  });
  it("leaves ordinary and short overnight events alone", () => {
    expect(suspectLength("19:00", "21:00")).toBeNull();
    expect(suspectLength("22:00", "02:00")).toBeNull();
    expect(suspectLength("20:00", "08:00")).toBeNull(); // exactly 12 hr
  });
});
