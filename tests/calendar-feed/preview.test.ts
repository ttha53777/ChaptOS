import { describe, expect, it } from "vitest";
import { upcomingPreview } from "@/lib/calendar-feed/preview";

const item = (title: string, schedule: object, extra: { sourceType?: string; cancelledAt?: Date } = {}) =>
  ({ published: { title, location: "", category: "chapter", schedule, timeUnconfirmed: false, transparent: false }, cancelledAt: extra.cancelledAt ?? null, sourceType: extra.sourceType ?? "calendar" });

describe("setup preview", () => {
  const now = new Date("2026-10-05T18:00:00Z");
  it("orders all-day and timed entries by when they start in the org's zone, skipping past and cancelled", () => {
    const rows = [
      item("Later", { kind: "allDay", start: "2026-10-07", end: "2026-10-08" }),
      item("Tonight", { kind: "timed", start: "2026-10-05T23:00:00Z", end: "2026-10-06T01:00:00Z", timeZone: "America/New_York" }),
      item("Earlier today, ongoing", { kind: "allDay", start: "2026-10-05", end: "2026-10-06" }),
      item("Over", { kind: "timed", start: "2026-10-05T12:00:00Z", end: "2026-10-05T13:00:00Z", timeZone: "America/New_York" }),
      item("Cancelled", { kind: "allDay", start: "2026-10-06", end: "2026-10-07" }, { cancelledAt: now }),
      item("Due", { kind: "allDay", start: "2026-10-06", end: "2026-10-07" }, { sourceType: "task" }),
    ];
    expect(upcomingPreview(rows, "America/New_York", now).map(e => e.title)).toEqual(["Earlier today, ongoing", "Tonight", "Due"]);
    expect(upcomingPreview(rows, "America/New_York", now, 5).find(e => e.title === "Due")?.deadline).toBe(true);
    expect(upcomingPreview([{ published: null, cancelledAt: null, sourceType: "calendar" }], null, now)).toEqual([]);
  });
});
