/**
 * Unit tests for lib/up-next.ts — the pure derivations behind the dashboard's
 * Up next card. No DB; `today` / `now` are injected. (vitest's global setup
 * still runs a `prisma db push`, so the test DB must be up.)
 */

import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/api-types";
import type { EventDetail } from "@/lib/event-details";
import { forMembers } from "@/lib/event-details";
import { agendaPreview, countdown, daysBetween, factsOf, lastPast, untilLabel, upcoming } from "@/lib/up-next";
import { startInstant } from "@/lib/event-time";

const TODAY = "2026-10-28";
// Local noon, so the legacy (zone-less) rows below read the same in any TZ.
const NOW = new Date(2026, 9, 28, 12, 0);

function ev(over: Partial<CalendarEvent> & { id: number; date: string }): CalendarEvent {
  return { title: `Event ${over.id}`, category: "chapter", mandatory: false, ...over };
}

describe("upcoming", () => {
  const events = [
    ev({ id: 1, date: "2026-10-27" }),                    // yesterday
    ev({ id: 2, date: "2026-11-02" }),
    ev({ id: 3, date: "2026-10-28", time: "7:00 PM" }),   // tonight
    ev({ id: 4, date: "2026-10-30" }),
  ];

  it("lists what's still to come, soonest first", () => {
    expect(upcoming(events, TODAY, NOW).map(e => e.id)).toEqual([3, 4, 2]);
  });

  it("skips the event whose check-in is live, so the card moves on", () => {
    expect(upcoming(events, TODAY, NOW, 3).map(e => e.id)).toEqual([4, 2]);
  });

  it("drops a timed event once it has ended today", () => {
    const done = ev({ id: 5, date: TODAY, schedule: { kind: "timed", start: new Date(2026, 9, 28, 9).toISOString(), end: new Date(2026, 9, 28, 10).toISOString(), timeZone: "UTC" } });
    expect(upcoming([done], TODAY, NOW)).toEqual([]);
  });
});

describe("lastPast", () => {
  it("names the most recent finished event and how long ago", () => {
    const r = lastPast([ev({ id: 1, date: "2026-10-20" }), ev({ id: 2, date: "2026-10-22" }), ev({ id: 3, date: "2026-11-01" })], TODAY, NOW);
    expect(r?.event.id).toBe(2);
    expect(r?.daysAgo).toBe(6);
  });

  it("is null when nothing has happened yet", () => {
    expect(lastPast([ev({ id: 1, date: "2026-11-01" })], TODAY, NOW)).toBeNull();
  });
});

describe("countdown", () => {
  it("draws a strip of every day up to a close event", () => {
    expect(countdown(ev({ id: 1, date: "2026-10-30" }), TODAY, NOW)).toEqual({
      kind: "days", days: 2, strip: ["2026-10-28", "2026-10-29", "2026-10-30"],
    });
  });

  it("crosses a month boundary", () => {
    const c = countdown(ev({ id: 1, date: "2026-11-02" }), TODAY, NOW);
    expect(c).toMatchObject({ kind: "days", days: 5 });
    expect(c.kind === "days" && c.strip?.at(-1)).toBe("2026-11-02");
  });

  it("is only a number when it's more than six days off", () => {
    expect(countdown(ev({ id: 1, date: "2026-11-12" }), TODAY, NOW)).toEqual({ kind: "days", days: 15, strip: null });
  });

  it("counts minutes to the start on the day", () => {
    expect(countdown(ev({ id: 1, date: TODAY, time: "3:40 PM" }), TODAY, NOW)).toEqual({ kind: "today", minutes: 220 });
  });

  it("has no minutes for an untimed event today", () => {
    expect(countdown(ev({ id: 1, date: TODAY }), TODAY, NOW)).toEqual({ kind: "today", minutes: null });
  });

  it("reads a schedule's instant", () => {
    const start = new Date(NOW.getTime() + 90 * 60_000).toISOString();
    expect(startInstant(ev({ id: 1, date: TODAY, schedule: { kind: "timed", start, timeZone: "UTC" } }))?.toISOString()).toBe(start);
    expect(startInstant(ev({ id: 1, date: TODAY, schedule: { kind: "allDay", start: TODAY, end: "2026-10-29" } }))).toBeNull();
  });
});

describe("untilLabel / daysBetween", () => {
  it("reads hours and minutes", () => {
    expect(untilLabel(220)).toBe("3h 40m");
    expect(untilLabel(120)).toBe("2h");
    expect(untilLabel(45)).toBe("45m");
    expect(untilLabel(0)).toBe("1m");
  });
  it("counts calendar days", () => {
    expect(daysBetween("2026-10-28", "2026-11-02")).toBe(5);
    expect(daysBetween("2026-10-28", "2026-10-28")).toBe(0);
  });
});

describe("factsOf", () => {
  const details: EventDetail[] = [
    { id: "c", type: "checklist", items: [{ id: "a", t: "Book room", done: false }] },
    { id: "s", type: "supplies", items: [{ id: "a", item: "Cups", who: 3 }, { id: "b", item: "Ice", who: null }, { id: "c", item: "Lights", who: null }] },
    { id: "g", type: "guests", mode: "plus", plus: 1 },
    { id: "d", type: "dress", pick: "Theme", note: "Haunted" },
    { id: "k", type: "capacity", cap: 120 },
    { id: "x", type: "contact", who: 3, phone: "555", prefer: "text" },
  ];

  it("reads in a fixed order and stops at four", () => {
    expect(factsOf(details)).toEqual([
      { kind: "dress", label: "Wear", value: "Theme · Haunted" },
      { kind: "guests", label: "Guests", value: "+1 each" },
      { kind: "capacity", label: "Capacity", value: "120" },
      { kind: "supplies", label: "Bring", value: "2 of 3 unclaimed", open: true },
    ]);
  });

  it("never surfaces planning details, even for an officer's copy", () => {
    expect(factsOf(details).map(f => f.kind)).not.toContain("checklist");
    expect(factsOf(forMembers(details)).map(f => f.kind)).not.toContain("checklist");
  });

  it("skips empty details and survives junk", () => {
    expect(factsOf([{ id: "d", type: "dress", pick: null, note: "" }, { id: "t", type: "theme", text: "  " }])).toEqual([]);
    expect(factsOf(null)).toEqual([]);
    expect(factsOf([{ type: "nonsense" }])).toEqual([]);
  });

  it("says when every supply is claimed", () => {
    expect(factsOf([{ id: "s", type: "supplies", items: [{ id: "a", item: "Cups", who: 3 }] }])).toEqual([
      { kind: "supplies", label: "Bring", value: "all 1 claimed" },
    ]);
  });
});

describe("agendaPreview", () => {
  it("takes the section headings", () => {
    const seed = "## Roll call\n\n## Treasurer\nDues\n## Homecoming\n## Formal vote\n## New business";
    expect(agendaPreview(seed)).toEqual({ items: ["Roll call", "Treasurer", "Homecoming"], more: 2 });
  });

  it("falls back to checklist and bullet lines", () => {
    expect(agendaPreview("[ ] Minutes\n• Dues\nloose text")).toEqual({ items: ["Minutes", "Dues"], more: 0 });
  });

  it("is null without a seed", () => {
    expect(agendaPreview(null)).toBeNull();
    expect(agendaPreview("   ")).toBeNull();
    expect(agendaPreview("just a paragraph")).toBeNull();
  });
});
