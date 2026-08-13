/**
 * The event-idea panel's two guards.
 *
 * The feature's whole safety story is that the model prefills ONLY what it can
 * know and refuses to invent the rest — a plausible date in a filled-looking
 * field is one Confirm away from a wrong event on a real calendar. Two pieces
 * enforce that, and both are pure functions worth pinning:
 *
 *   1. draftMissing — what keeps Confirm locked, and what the card names as the
 *      reason. It must consider a blank date blocking even though every other
 *      field is filled, because the blank date is the deliberate part.
 *   2. eventIdeaInput — the request schema, which has no date/time/location
 *      field at all. That absence is the load-bearing bit: a date can't be
 *      guessed by a model that is never asked for one, and can't be smuggled in
 *      by a client either.
 *
 * Pure unit — no DB, no DOM, no OpenAI.
 */

import { describe, it, expect } from "vitest";
import { draftMissing, type EventDraft } from "@/app/components/chat/EventDraftCard";
import { eventIdeaInput } from "@/lib/validation/ai";

const complete: EventDraft = {
  title: "Weekly Brotherhood Dinner",
  date: "2026-08-27",
  time: "19:00",
  category: "social",
  location: "Chapter house",
  description: "",
  mandatory: false,
};

describe("draftMissing", () => {
  it("clears once the required three are filled", () => {
    expect(draftMissing(complete)).toEqual([]);
  });

  it("blocks on the date the model refused to guess", () => {
    expect(draftMissing({ ...complete, date: "" })).toEqual(["a date"]);
  });

  it("blocks on a category the guess couldn't resolve", () => {
    expect(draftMissing({ ...complete, category: "" })).toEqual(["a category"]);
  });

  it("blocks on a title emptied by the user", () => {
    expect(draftMissing({ ...complete, title: "   " })).toEqual(["a title"]);
  });

  it("names every missing field, so the foot can explain the lock in full", () => {
    expect(draftMissing({ ...complete, title: "", date: "", category: "" }))
      .toEqual(["a title", "a date", "a category"]);
  });

  it("does not block on the optional fields", () => {
    // time/location/description are legitimately blank on most events — treating
    // them as required would put the lock on fields nobody needs to fill.
    expect(draftMissing({ ...complete, time: "", location: "", description: "" })).toEqual([]);
  });
});

describe("eventIdeaInput", () => {
  it("accepts the tapped row's text", () => {
    const parsed = eventIdeaInput.parse({
      title: "Weekly Brotherhood Dinner",
      subtitle: "Cheap, repeatable, reaches the quiet half of the roster",
      question: "What should we run for brotherhood this term?",
    });
    expect(parsed.title).toBe("Weekly Brotherhood Dinner");
  });

  it("accepts a bare title — subtitle and question are context, not requirements", () => {
    expect(eventIdeaInput.parse({ title: "Game Night" }).subtitle).toBeUndefined();
  });

  it("rejects an empty title, which would open a panel about nothing", () => {
    expect(() => eventIdeaInput.parse({ title: "   " })).toThrow();
  });

  it("strips a date the client tried to supply", () => {
    // The schema has no date/time/location field, so zod drops them. This is the
    // invariant: there is no path by which a date reaches the draft except a
    // human typing one into the card.
    const parsed = eventIdeaInput.parse({
      title: "Game Night",
      date: "2026-09-01",
      time: "7:00 PM",
      location: "Chapter house",
    }) as Record<string, unknown>;
    expect(parsed.date).toBeUndefined();
    expect(parsed.time).toBeUndefined();
    expect(parsed.location).toBeUndefined();
  });
});
