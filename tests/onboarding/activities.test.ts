/**
 * lib/onboarding/activities.ts — the interview's ACTIVITIES beat.
 *
 * readActivities() is the correctness-critical one. Its result is authoritative
 * (an option the answer doesn't name gets its page turned OFF), and it is the
 * ONLY reader a founder meets whenever AI is unconfigured, rate-limited, or has
 * handed off mid-conversation. The regression it exists to prevent: a flat
 * keyword scan read "we don't do service" as an affirmative and built the exact
 * inverse of the org the founder described.
 */

import { describe, expect, it } from "vitest";
import {
  ACTIVITY_IDS,
  ACTIVITY_OPTIONS,
  ACTIVITY_OWNED,
  activityLabels,
  activityPicksToAiPicks,
  readActivities,
} from "@/lib/onboarding/activities";

/** The selection a text answer resolves to, as a sorted array (or null). */
function ids(text: string): string[] | null {
  const read = readActivities(text);
  return read ? [...read.ids].sort() : null;
}

describe("readActivities: plain affirmatives", () => {
  it("names what it names, and nothing else", () => {
    expect(ids("we have chapter meetings every week")).toEqual(["meetings"]);
    expect(ids("meetings and socials, mostly")).toEqual(["meetings", "socials"]);
  });

  it("reads a blanket yes as every option", () => {
    expect(ids("all of them")).toEqual([...ACTIVITY_IDS].sort());
    expect(ids("we do everything on that list")).toEqual([...ACTIVITY_IDS].sort());
  });

  it("reads a blanket no as none — a real answer, not an unreadable one", () => {
    expect(ids("none of those")).toEqual([]);
    expect(ids("nothing like that really")).toEqual([]);
  });

  it("returns null for an answer it can't read, rather than guessing empty", () => {
    // The distinction that matters: empty means "turn all six pages off", so a
    // bare "yes" must never collapse into it.
    expect(readActivities("yes")).toBeNull();
    expect(readActivities("sure thing")).toBeNull();
    expect(readActivities("")).toBeNull();
  });
});

describe("readActivities: negation", () => {
  it("does not invert a negated activity (the bug)", () => {
    const read = readActivities("we don't do service, but everything else yeah");
    expect(read).not.toBeNull();
    expect(read!.confident).toBe(true);
    expect(read!.ids.has("service")).toBe(false);
    expect([...read!.ids].sort()).toEqual(
      ACTIVITY_IDS.filter(id => id !== "service").sort(),
    );
  });

  it("keeps polarity per clause", () => {
    expect(ids("meetings yes, parties no")).toEqual(["meetings"]);
    expect(ids("we do a lot of service. no socials though")).toEqual(["service"]);
  });

  it("handles every contraction form of a negation", () => {
    for (const text of [
      "we don't do service",
      "we do not do service",
      "we never do service",
      "no service",
    ]) {
      const read = readActivities(text);
      expect(read, text).not.toBeNull();
      expect(read!.off.has("service"), text).toBe(true);
      expect(read!.ids.has("service"), text).toBe(false);
    }
  });

  it("flips polarity after an exception marker", () => {
    expect(ids("everything except service")).toEqual(
      ACTIVITY_IDS.filter(id => id !== "service").sort(),
    );
    expect(ids("all of them apart from parties")).toEqual(
      ACTIVITY_IDS.filter(id => id !== "socials").sort(),
    );
  });

  it("treats a negatives-only answer as UNCONFIRMED, not as a decision", () => {
    // "no parties" says what they don't do and nothing about what they do.
    // Acting on it either way invents an answer, so the caller re-opens the
    // checklist pre-ticked with the rest instead of submitting.
    const read = readActivities("no parties");
    expect(read).not.toBeNull();
    expect(read!.confident).toBe(false);
    expect(read!.off).toEqual(new Set(["socials"]));
    expect([...read!.ids].sort()).toEqual(
      ACTIVITY_IDS.filter(id => id !== "socials").sort(),
    );
  });

  it("does not let a leading hedge swallow the specifics that follow", () => {
    // "nah" alone would read as a blanket none; followed by real content it is
    // just conversational filler.
    const read = readActivities("nah, we don't throw parties");
    expect(read).not.toBeNull();
    expect(read!.ids.has("socials")).toBe(false);
    expect(read!.confident).toBe(false);
  });
});

describe("activityPicksToAiPicks", () => {
  it("is authoritative: unnamed activity pages are explicitly removed", () => {
    const picks = activityPicksToAiPicks(new Set(["meetings"]));
    expect(picks.addWorkflows.sort()).toEqual(["attendance", "meetings"]);
    // Everything else the checklist owns comes back as a removal, which is what
    // stops an org-type template's guess surviving an answer that didn't name it.
    expect(picks.removeWorkflows.sort()).toEqual(
      ACTIVITY_OWNED.filter(w => w !== "meetings" && w !== "attendance").sort(),
    );
  });

  it("removes the whole domain when nothing was named", () => {
    const picks = activityPicksToAiPicks(new Set());
    expect(picks.addWorkflows).toEqual([]);
    expect(picks.removeWorkflows.sort()).toEqual([...ACTIVITY_OWNED].sort());
  });
});

describe("activityLabels", () => {
  it("returns checklist labels in checklist order", () => {
    expect(activityLabels(new Set(["online", "meetings"]))).toEqual([
      "Chapter meetings",
      "Posting content online",
    ]);
  });
});

describe("the checklist table itself", () => {
  it("has an id for every option and no duplicates", () => {
    expect(new Set(ACTIVITY_IDS).size).toBe(ACTIVITY_OPTIONS.length);
  });

  it("every keyword-matchable option can actually be reached by typing", () => {
    // A label the reader can't produce would be tap-only — fine for a chip, not
    // for a beat whose composer invites "describe a normal month in your words".
    const reachable = new Set<string>();
    for (const text of [
      "chapter meetings",
      "parties",
      "volunteering",
      "fundraisers",
      "deadlines",
      "posting on instagram",
    ]) {
      for (const id of readActivities(text)?.ids ?? []) reachable.add(id);
    }
    expect([...reachable].sort()).toEqual([...ACTIVITY_IDS].sort());
  });
});
