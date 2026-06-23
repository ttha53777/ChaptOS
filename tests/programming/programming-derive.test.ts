/**
 * Unit tests for the pure page-derivation helpers in lib/programming.ts that
 * drive the redesigned events page (on-deck hero, attention rail, glance strip).
 * No DB — these operate on the in-memory task list the page already holds.
 */

import { describe, expect, it } from "vitest";
import {
  eventsNeedingAttention,
  eventsTermStats,
  nextOnDeckEvent,
  programmingPrepChecks,
  programmingPrepScore,
  type ProgrammingTaskDto,
} from "@/lib/programming";

const TODAY = "2026-06-15";

/** Minimal valid ProgrammingTaskDto; override only what a test cares about. */
function task(over: Partial<ProgrammingTaskDto> = {}): ProgrammingTaskDto {
  return {
    id: Math.floor(Math.random() * 1e9),
    title: "Event",
    dueDate: null,
    location: "",
    time: null,
    status: "Upcoming",
    type: "Social",
    stage: "confirmed",
    mandatory: false,
    collab: null,
    owner: "",
    description: null,
    attachmentUrl: null,
    attachmentDocId: null,
    roomStatus: "not_submitted",
    itineraryNotNeeded: false,
    flyerPosted: false,
    socialsMeeting: false,
    spendingCents: 0,
    successRating: null,
    wrapUpNotes: null,
    checklist: [],
    ...over,
  };
}

describe("programmingPrepScore / programmingPrepChecks", () => {
  it("counts four checks", () => {
    expect(programmingPrepScore(task()).total).toBe(4);
    expect(programmingPrepChecks(task())).toHaveLength(4);
  });

  it("scores zero when nothing is prepped", () => {
    expect(programmingPrepScore(task())).toEqual({ done: 0, total: 4 });
  });

  it("counts room (confirmed or na), attachment, flyer, and socials meeting", () => {
    const full = task({
      roomStatus: "confirmed",
      attachmentUrl: "https://x.test/itin",
      flyerPosted: true,
      socialsMeeting: true,
    });
    expect(programmingPrepScore(full)).toEqual({ done: 4, total: 4 });

    // roomStatus "na" also counts as room-done; attachmentDocId satisfies attachment.
    const partial = task({ roomStatus: "na", attachmentDocId: 7 });
    const score = programmingPrepScore(partial);
    expect(score.done).toBe(2); // room + attachment, no flyer/socials
  });

  it("treats itinerary as done when marked not-needed, even without a file", () => {
    const check = programmingPrepChecks(task({ itineraryNotNeeded: true }))[1];
    expect(check.key).toBe("attachment");
    expect(check.done).toBe(true);
  });

  it("treats submitted/not_submitted room as not done", () => {
    expect(programmingPrepChecks(task({ roomStatus: "submitted" }))[0].done).toBe(false);
    expect(programmingPrepChecks(task({ roomStatus: "not_submitted" }))[0].done).toBe(false);
  });
});

describe("nextOnDeckEvent", () => {
  it("returns the soonest dated, not-done event on or after today", () => {
    const list = [
      task({ id: 1, dueDate: "2026-06-20" }),
      task({ id: 2, dueDate: "2026-06-16" }),
      task({ id: 3, dueDate: "2026-07-01" }),
    ];
    expect(nextOnDeckEvent(list, TODAY)?.id).toBe(2);
  });

  it("includes an event dated exactly today", () => {
    const list = [task({ id: 9, dueDate: TODAY }), task({ id: 10, dueDate: "2026-06-30" })];
    expect(nextOnDeckEvent(list, TODAY)?.id).toBe(9);
  });

  it("ignores past, dateless, and done events", () => {
    const list = [
      task({ id: 1, dueDate: "2026-06-01" }),          // past
      task({ id: 2, dueDate: null }),                   // no date
      task({ id: 3, dueDate: "2026-06-25", stage: "done" }), // done
    ];
    expect(nextOnDeckEvent(list, TODAY)).toBeNull();
  });

  it("returns null for an empty slate", () => {
    expect(nextOnDeckEvent([], TODAY)).toBeNull();
  });
});

describe("eventsNeedingAttention", () => {
  it("flags an unbooked room as a rose blocker", () => {
    const list = [task({ id: 1, dueDate: "2026-06-20", roomStatus: "not_submitted" })];
    const out = eventsNeedingAttention(list, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ reason: "room", tone: "rose" });
  });

  it("flags a missing flyer as a gold nudge once the room is handled", () => {
    const list = [task({ id: 1, dueDate: "2026-06-20", roomStatus: "confirmed", flyerPosted: false })];
    expect(eventsNeedingAttention(list, TODAY)[0]).toMatchObject({ reason: "flyer", tone: "gold" });
  });

  it("flags incomplete prep (gold) when room+flyer are done but other checks aren't", () => {
    const list = [task({
      id: 1, dueDate: "2026-06-20",
      roomStatus: "confirmed", flyerPosted: true,
      // missing attachment + socials → prep incomplete
    })];
    expect(eventsNeedingAttention(list, TODAY)[0]).toMatchObject({ reason: "prep", tone: "gold" });
  });

  it("omits fully-prepped, past, and done events; sorts soonest first", () => {
    const ready = {
      roomStatus: "confirmed" as const, flyerPosted: true,
      socialsMeeting: true, attachmentUrl: "https://x.test",
    };
    const list = [
      task({ id: 1, dueDate: "2026-06-30", ...ready }),                 // fully prepped → omit
      task({ id: 2, dueDate: "2026-06-01", roomStatus: "not_submitted" }), // past → omit
      task({ id: 3, dueDate: "2026-06-28", stage: "done" }),            // done → omit
      task({ id: 4, dueDate: "2026-06-25", roomStatus: "not_submitted" }),
      task({ id: 5, dueDate: "2026-06-18", roomStatus: "not_submitted" }),
    ];
    const out = eventsNeedingAttention(list, TODAY);
    expect(out.map(e => e.task.id)).toEqual([5, 4]);
  });
});

describe("eventsTermStats", () => {
  it("counts stages, the 14-day window, room gaps, avg success, and spend", () => {
    const list = [
      task({ stage: "idea" }),
      task({ stage: "planning" }),
      task({ stage: "confirmed", dueDate: "2026-06-18", roomStatus: "not_submitted", spendingCents: 5000 }),
      task({ stage: "confirmed", dueDate: "2026-06-29", roomStatus: "confirmed", spendingCents: 2000 }),
      task({ stage: "confirmed", dueDate: "2026-07-10" }), // outside 14-day window
      task({ stage: "done", successRating: 5, spendingCents: 1000 }),
      task({ stage: "done", successRating: 3 }),
    ];
    const s = eventsTermStats(list, TODAY);
    expect(s.total).toBe(7);
    expect(s.byStage).toEqual({ idea: 1, planning: 1, confirmed: 3, done: 2 });
    expect(s.next14).toBe(2);          // Jun 18 + Jun 29 (Jul 10 is > today+14)
    expect(s.next14NeedRoom).toBe(1);  // only Jun 18 is not_submitted
    expect(s.avgSuccess).toBe(4);      // (5 + 3) / 2
    expect(s.doneCount).toBe(2);
    expect(s.spendCents).toBe(8000);
  });

  it("reports null avg success when nothing is rated", () => {
    expect(eventsTermStats([task({ stage: "done" })], TODAY).avgSuccess).toBeNull();
  });

  it("includes the upper edge of the 14-day window (today + 14)", () => {
    const list = [
      task({ stage: "confirmed", dueDate: "2026-06-29" }), // today+14 exactly
      task({ stage: "confirmed", dueDate: "2026-06-30" }), // today+15
    ];
    expect(eventsTermStats(list, TODAY).next14).toBe(1);
  });
});
