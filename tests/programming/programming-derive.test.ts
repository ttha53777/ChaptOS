/**
 * Unit tests for the pure gate + derivation helpers in lib/programming.ts.
 *
 * These are the rules that decide which lane an event may sit in, and they run
 * in two places that must never disagree: the service (over a raw DB row) and
 * the page (over a mapped DTO). No DB here — everything is in-memory.
 *
 * The fixture cases are ported from the v3 design mock, so a behavior change
 * here shows up as a diff against the design argument rather than silently.
 */

import { describe, expect, it } from "vitest";
import {
  attentionLabel,
  canEnter,
  eventsNeedingAttention,
  eventsTermStats,
  fieldsFor,
  hasRequiredField,
  missingFor,
  needsConfirmFirst,
  nextOnDeckEvent,
  REQUIRED_FIELDS,
  type ProgrammingTaskDto,
} from "@/lib/programming";
import type { OwnerRef } from "@/lib/event-owner";

const TODAY = "2026-06-15";

const person = (name = "Maya Chen"): OwnerRef => ({ kind: "brother", id: 1, name, initials: "MC" });
const role = (name = "Social Chair", holders: string[] = ["Maya Chen"]): OwnerRef =>
  ({ kind: "role", id: 7, name, holders });

/** Minimal valid ProgrammingTaskDto; override only what a test cares about. */
function task(over: Partial<ProgrammingTaskDto> = {}): ProgrammingTaskDto {
  return {
    id: Math.floor(Math.random() * 1e9),
    title: "Event",
    dueDate: null,
    location: "",
    time: null,
    status: "Upcoming",
    category: "social",
    type: "Social",
    stage: "confirmed",
    mandatory: false,
    collab: null,
    owner: null,
    ownerNote: null,
    description: null,
    attachmentUrl: null,
    attachmentDocId: null,
    fieldValues: {},
    detachedFields: [],
    spendingCents: 0,
    successRating: null,
    wrapUpNotes: null,
    ...over,
  };
}

describe("REQUIRED_FIELDS is the single source the UI builds itself from", () => {
  // The fix-step picks its editors from `kind` and the help screen filters on
  // it, so an entry missing either property degrades to a text box or a wrong
  // sentence rather than failing loudly.
  it("gives every field a usable kind and a non-empty hint", () => {
    const kinds = new Set(["text", "type", "person", "date", "bool"]);
    for (const f of REQUIRED_FIELDS) {
      expect(kinds.has(f.kind), `${f.key} has kind "${f.kind}"`).toBe(true);
      expect(f.hint.trim().length, `${f.key} has a hint`).toBeGreaterThan(0);
    }
  });

  // The help overlay drops bool fields so Confirmed reads as two errands ("a
  // date and a location"), not three — attendance is always answered, so
  // listing it would name a chore that doesn't exist. Pinned because the copy
  // silently stops matching the rules if a third non-bool field is ever added.
  it("leaves Confirmed with exactly two fields a human has to go get", () => {
    const errands = REQUIRED_FIELDS.filter(f => f.gate === "confirmed" && f.kind !== "bool");
    expect(errands.map(f => f.key)).toEqual(["date", "location"]);
  });
});

describe("fieldsFor", () => {
  it("is cumulative down the lanes", () => {
    expect(fieldsFor("idea").map(f => f.key)).toEqual(["title", "category"]);
    expect(fieldsFor("planning").map(f => f.key)).toEqual(["title", "category", "owner"]);
    expect(fieldsFor("confirmed").map(f => f.key)).toEqual(
      ["title", "category", "owner", "date", "location", "mandatory"],
    );
  });

  it("asks Done for exactly what Confirmed asks", () => {
    // What makes Done distinct is the ROUTE it must arrive by, not an extra
    // field — see needsConfirmFirst.
    expect(fieldsFor("done")).toEqual(fieldsFor("confirmed"));
  });
});

describe("hasRequiredField", () => {
  it("reads the owner from either the DTO shape or the raw FK pair", () => {
    // One gate definition serves the service (raw row) and the page (mapped
    // DTO); if these two disagreed, the board and the server would too.
    expect(hasRequiredField({ owner: person() }, "owner")).toBe(true);
    expect(hasRequiredField({ ownerBrotherId: 4 }, "owner")).toBe(true);
    expect(hasRequiredField({ ownerRoleId: 9 }, "owner")).toBe(true);
    expect(hasRequiredField({ owner: null }, "owner")).toBe(false);
  });

  it("does not accept a retired ownerNote as an owner", () => {
    // A pre-migration string that matched nobody is a note, not an accountable
    // person; treating it as an owner would let an unowned event into Planning.
    expect(hasRequiredField(task({ owner: null, ownerNote: "Chris" }), "owner")).toBe(false);
  });

  it("treats mandatory:false as ANSWERED, not empty", () => {
    // A boolean is answered by existing. Checking truthiness here would make
    // every optional-attendance event permanently unconfirmable.
    expect(hasRequiredField({ mandatory: false }, "mandatory")).toBe(true);
  });

  it("rejects whitespace-only text as unanswered", () => {
    expect(hasRequiredField({ location: "   " }, "location")).toBe(false);
    expect(hasRequiredField({ title: "  " }, "title")).toBe(false);
  });

  it("accepts either date key, since row and DTO spell it differently", () => {
    expect(hasRequiredField({ date: "2026-06-20" }, "date")).toBe(true);
    expect(hasRequiredField({ dueDate: "2026-06-20" }, "date")).toBe(true);
  });
});

describe("canEnter / missingFor", () => {
  it("refuses Planning without an owner and accepts it with either kind", () => {
    const unowned = task({ stage: "idea", owner: null });
    expect(canEnter(unowned, "planning")).toBe(false);
    expect(missingFor(unowned, "planning").map(f => f.key)).toEqual(["owner"]);

    expect(canEnter(task({ owner: person() }), "planning")).toBe(true);
    expect(canEnter(task({ owner: role() }), "planning")).toBe(true);
  });

  it("names BOTH missing confirm fields — the mock's Boba Fundraiser case", () => {
    const boba = task({ stage: "planning", title: "Boba Fundraiser", owner: person(), dueDate: null, location: "" });
    expect(canEnter(boba, "confirmed")).toBe(false);
    expect(missingFor(boba, "confirmed").map(f => f.label)).toEqual(["Date", "Location"]);
  });

  it("names only the one that's missing", () => {
    const dated = task({ stage: "planning", owner: person(), dueDate: "2026-07-01", location: "" });
    expect(missingFor(dated, "confirmed").map(f => f.key)).toEqual(["location"]);

    const placed = task({ stage: "planning", owner: person(), dueDate: null, location: "EMU" });
    expect(missingFor(placed, "confirmed").map(f => f.key)).toEqual(["date"]);
  });

  it("passes a complete event — the mock's Spring Banquet case", () => {
    const banquet = task({
      stage: "planning", title: "Spring Banquet", owner: person(), dueDate: "2026-07-01", location: "Ballroom",
    });
    expect(canEnter(banquet, "confirmed")).toBe(true);
    expect(missingFor(banquet, "confirmed")).toEqual([]);
  });
});

describe("needsConfirmFirst", () => {
  it("blocks Planning → Done even when every field is answered", () => {
    // The whole point: a complete Planning event satisfies every FIELD Confirmed
    // needs, so field checks alone would wave it through to Done — publishing it
    // to the chapter with a toast that only says "wrapped".
    const ready = task({ stage: "planning", owner: person(), dueDate: "2026-06-01", location: "EMU" });
    expect(canEnter(ready, "done")).toBe(true);
    expect(needsConfirmFirst(ready, "done")).toBe(true);
  });

  it("allows Confirmed → Done", () => {
    expect(needsConfirmFirst(task({ stage: "confirmed" }), "done")).toBe(false);
  });

  it("has nothing to say about any other target lane", () => {
    expect(needsConfirmFirst(task({ stage: "idea" }), "planning")).toBe(false);
    expect(needsConfirmFirst(task({ stage: "planning" }), "confirmed")).toBe(false);
  });
});

describe("eventsNeedingAttention", () => {
  it("flags an unowned idea and stays quiet about an owned one", () => {
    const unowned = task({ stage: "idea", title: "Speaker Series", owner: null, dueDate: null });
    const owned   = task({ stage: "idea", title: "Beach Cleanup", owner: person(), dueDate: null });

    const out = eventsNeedingAttention([unowned, owned], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0]!.task.title).toBe("Speaker Series");
    expect(attentionLabel(out[0]!)).toBe("Needs an owner");
  });

  it("names a planning event's missing confirm fields", () => {
    const boba = task({
      stage: "planning", title: "Boba Fundraiser", owner: person(), dueDate: "2026-06-20", location: "",
    });
    const out = eventsNeedingAttention([boba], TODAY);
    expect(attentionLabel(out[0]!)).toBe("Needs location");
  });

  it("says nothing about Confirmed or Done — they are settled", () => {
    const confirmed = task({ stage: "confirmed", owner: person(), dueDate: "2026-06-20", location: "EMU" });
    const done      = task({ stage: "done", owner: person(), dueDate: "2026-06-01", location: "EMU" });
    expect(eventsNeedingAttention([confirmed, done], TODAY)).toEqual([]);
  });

  it("reads rose inside 14 days and gold outside it", () => {
    const soon = task({ stage: "idea", owner: null, dueDate: "2026-06-20" });   // 5 days
    const far  = task({ stage: "idea", owner: null, dueDate: "2026-08-20" });   // ~66 days
    const out = eventsNeedingAttention([far, soon], TODAY);
    expect(out.find(e => e.task.id === soon.id)!.tone).toBe("rose");
    expect(out.find(e => e.task.id === far.id)!.tone).toBe("gold");
  });

  it("keeps an undated unowned idea, sorted last", () => {
    // A dateless idea nobody owns is exactly the card that goes stale unnoticed —
    // the prep version this replaced dropped it entirely.
    const undated = task({ stage: "idea", title: "Someday", owner: null, dueDate: null });
    const dated   = task({ stage: "idea", title: "Soon", owner: null, dueDate: "2026-06-20" });
    const out = eventsNeedingAttention([undated, dated], TODAY);
    expect(out.map(e => e.task.title)).toEqual(["Soon", "Someday"]);
  });

  it("drops events whose date has already passed", () => {
    const past = task({ stage: "planning", owner: person(), dueDate: "2026-01-01", location: "" });
    expect(eventsNeedingAttention([past], TODAY)).toEqual([]);
  });
});

describe("eventsTermStats", () => {
  it("counts the next 14 days' events that can't be confirmed yet", () => {
    const rows = [
      task({ stage: "planning", owner: person(), dueDate: "2026-06-20", location: "EMU" }),  // ready
      task({ stage: "planning", owner: person(), dueDate: "2026-06-21", location: "" }),     // no location
      task({ stage: "idea",     owner: null,     dueDate: "2026-06-22", location: "EMU" }),  // no owner
      task({ stage: "planning", owner: person(), dueDate: "2026-09-01", location: "" }),     // outside window
    ];
    const stats = eventsTermStats(rows, TODAY);
    expect(stats.next14).toBe(3);
    expect(stats.next14Unready).toBe(2);
  });

  it("tallies stages, spend, and average success", () => {
    const rows = [
      task({ stage: "done", successRating: 4, spendingCents: 1000 }),
      task({ stage: "done", successRating: 2, spendingCents: 500 }),
      task({ stage: "idea", owner: person() }),
    ];
    const stats = eventsTermStats(rows, TODAY);
    expect(stats.total).toBe(3);
    expect(stats.byStage.done).toBe(2);
    expect(stats.doneCount).toBe(2);
    expect(stats.avgSuccess).toBe(3);
    expect(stats.spendCents).toBe(1500);
  });

  // "On the slate" answers what's still ahead. A term's worth of Done events
  // would swamp it by November, at which point it stops measuring anything.
  it("excludes Done from liveTotal but keeps it in total", () => {
    const rows = [
      task({ stage: "idea" }),
      task({ stage: "planning", owner: person() }),
      task({ stage: "confirmed", owner: person(), dueDate: "2026-07-01", location: "EMU" }),
      task({ stage: "done", owner: person(), dueDate: "2026-05-01", location: "EMU" }),
      task({ stage: "done", owner: person(), dueDate: "2026-05-02", location: "EMU" }),
    ];
    const stats = eventsTermStats(rows, TODAY);
    expect(stats.total).toBe(5);
    expect(stats.liveTotal).toBe(3);
  });

  // The measure the owner gate exists to make visible.
  it("counts unowned IDEAS only — an unowned plan can't exist", () => {
    const rows = [
      task({ stage: "idea", owner: null }),
      task({ stage: "idea", owner: null }),
      task({ stage: "idea", owner: person() }),
      // Owned, later lane: must not be counted as an unowned idea.
      task({ stage: "planning", owner: person() }),
    ];
    const stats = eventsTermStats(rows, TODAY);
    expect(stats.ideaCount).toBe(3);
    expect(stats.unownedIdeas).toBe(2);
  });

  it("reports zero unowned ideas when there are no ideas at all", () => {
    const stats = eventsTermStats([task({ stage: "planning", owner: person() })], TODAY);
    expect(stats.ideaCount).toBe(0);
    expect(stats.unownedIdeas).toBe(0);
  });
});

describe("nextOnDeckEvent", () => {
  it("picks the soonest dated, not-done event on or after today", () => {
    const rows = [
      task({ stage: "confirmed", title: "Later",   dueDate: "2026-07-01" }),
      task({ stage: "confirmed", title: "Sooner",  dueDate: "2026-06-18" }),
      task({ stage: "done",      title: "Wrapped", dueDate: "2026-06-16" }),
      task({ stage: "confirmed", title: "Past",    dueDate: "2026-06-01" }),
    ];
    expect(nextOnDeckEvent(rows, TODAY)?.title).toBe("Sooner");
  });

  it("returns null when nothing is coming up", () => {
    expect(nextOnDeckEvent([task({ stage: "idea", dueDate: null })], TODAY)).toBeNull();
  });
});
