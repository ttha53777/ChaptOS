/**
 * The paper /create interview's answer model (lib/onboarding/answers.ts) and
 * the reducer actions that drive it.
 *
 * The property that matters most: answers are REBUILT from all of them at once,
 * so changing one on the recap never drops what another decided — and the term
 * the founder picks reaches POST /api/orgs as the org's first active semester.
 */

import { describe, expect, it } from "vitest";
import {
  INTERVIEW_BEATS,
  defaultFounderTitle,
  deriveFromAnswers,
  nextUnansweredBeat,
  readDocsAnswer,
  readFounderName,
  readFounderTitle,
  readMoneyAnswer,
  termFromSuggestion,
  workflowsFromAnswers,
} from "@/lib/onboarding/answers";
import { draftToCreateOrgInput, emptyDraft, parseDraft, type Draft } from "@/lib/onboarding/draft";
import { flowReducer, type FlowAction } from "@/app/create/_components/flow-state";
import { createOrgInput } from "@/lib/validation/org";

const TODAY = "2026-10-07";

function run(actions: FlowAction[], from: Draft = { ...emptyDraft(), name: "Oozma Kappa" }): Draft {
  return actions.reduce(flowReducer, from);
}

describe("workflowsFromAnswers", () => {
  it("is base pages until anything is answered", () => {
    expect(workflowsFromAnswers({})).toEqual(["members", "operations"]);
  });

  it("turns on what the month names, and money has the final word on Treasury", () => {
    const fundraise = workflowsFromAnswers({ acts: ["fundraise"] });
    expect(fundraise).toContain("events");
    expect(fundraise).toContain("finance");
    // "No money" comes after the month and wins over a ticked fundraiser.
    expect(workflowsFromAnswers({ acts: ["fundraise"], money: "none" })).not.toContain("finance");
    expect(workflowsFromAnswers({ money: "some" })).toContain("finance");
  });

  it("puts Docs on for files — scattered or not — and off for none", () => {
    expect(workflowsFromAnswers({ docs: "yes" })).toContain("docs");
    expect(workflowsFromAnswers({ docs: "scattered" })).toContain("docs");
    expect(workflowsFromAnswers({ docs: "none" })).not.toContain("docs");
  });

  it("pairs attendance with meetings", () => {
    const w = workflowsFromAnswers({ acts: ["meetings"] });
    expect(w).toContain("meetings");
    expect(w).toContain("attendance");
  });
});

describe("deriveFromAnswers", () => {
  it("forces Dues owed off without Treasury, even when it was picked", () => {
    const d = run([
      { type: "answerKind", kind: "fraternity", text: null },
      { type: "answerMonth", acts: ["meetings", "service"] },
      { type: "answerMoney", value: "none" },
      { type: "answerMetrics", flags: { attendance: true, gpa: true, duesOwed: true, serviceHours: true } },
    ]);
    expect(d.enabledWorkflows).not.toContain("finance");
    expect(d.metrics.duesOwed).toBe(false);
    expect(d.metrics.gpa).toBe(true);
  });

  it("brings a picked Dues owed back when money is changed to yes", () => {
    const d = run([
      { type: "answerKind", kind: "fraternity", text: null },
      { type: "answerMoney", value: "none" },
      { type: "answerMetrics", flags: { attendance: true, gpa: false, duesOwed: true, serviceHours: false } },
      { type: "answerMoney", value: "yes" },
    ]);
    expect(d.metrics.duesOwed).toBe(true);
  });

  it("drops the service-hours default when there's no service page (until tracking is answered)", () => {
    const d = run([
      { type: "answerKind", kind: "fraternity", text: null },
      { type: "answerMonth", acts: ["meetings"] },
    ]);
    expect(d.metrics.serviceHours).toBe(false);
  });

  it("defaults the term to the kind's calendar until one is picked", () => {
    const team = deriveFromAnswers({ ...emptyDraft(), kind: "team" }, TODAY);
    expect(team.term?.model).toBe("season");
    const club = deriveFromAnswers({ ...emptyDraft(), kind: "club" }, TODAY);
    expect(club.term?.model).toBe("semester");
    expect(club.term?.label).toBe("Fall 2026");
  });

  it("keeps a picked term through later answers", () => {
    const d = run([
      { type: "answerKind", kind: "club", text: null },
      { type: "setTerm", model: "quarter", pick: 1 },
      { type: "answerMonth", acts: [] },
    ]);
    expect(d.term?.model).toBe("quarter");
    expect(d.answers.term).toBe(true);
  });
});

describe("the recap can change any answer without losing the rest", () => {
  const answered = run([
    { type: "answerIntro", founderName: "Priya Shah" },
    { type: "answerKind", kind: "fraternity", text: null },
    { type: "answerRole", title: "Treasurer" },
    { type: "answerMonth", acts: ["meetings", "socials"] },
    { type: "answerMoney", value: "yes" },
    { type: "answerDocs", value: "yes" },
  ]);

  it("re-answering the kind keeps the month, money and docs pages", () => {
    const d = flowReducer(answered, { type: "answerKind", kind: "club", text: null });
    expect(d.kind).toBe("club");
    for (const w of ["meetings", "attendance", "parties", "finance", "docs"] as const) {
      expect(d.enabledWorkflows).toContain(w);
    }
    expect(d.activitiesAnswered).toBe(true);
    // A real title survives the kind change…
    expect(d.seats.find(s => s.all)?.title).toBe("Treasurer");
  });

  it("…but a title that was only the old kind's default follows the new kind", () => {
    const pres = flowReducer(answered, { type: "answerRole", title: defaultFounderTitle("fraternity") });
    const team = flowReducer(pres, { type: "answerKind", kind: "team", text: null });
    expect(team.seats.find(s => s.all)?.title).toBe(defaultFounderTitle("team"));
    expect(team.answers.title).toBeUndefined();
  });

  it("applies a variant only on evidence in the typed answer", () => {
    const bare = run([{ type: "answerKind", kind: "fraternity", text: "A fraternity" }]);
    expect(bare.variant).toBeNull();
    const pro = run([{ type: "answerKind", kind: "fraternity", text: "a pre-med professional frat" }]);
    expect(pro.variant).toBe("professional");
  });
});

describe("nextUnansweredBeat", () => {
  it("walks the spine in order and ends at null", () => {
    let d: Draft = { ...emptyDraft(), name: "X" };
    expect(nextUnansweredBeat(d)).toBe("intro");
    d = run(
      [
        { type: "answerIntro", founderName: "" },
        { type: "answerKind", kind: "club", text: null },
        { type: "answerRole", title: "President" },
        { type: "answerMonth", acts: [] },
        { type: "answerMoney", value: "none" },
        { type: "answerDocs", value: "none" },
        { type: "answerMetrics", flags: { attendance: false, gpa: false, duesOwed: false, serviceHours: false } },
      ],
      d,
    );
    expect(nextUnansweredBeat(d)).toBe("term");
    d = flowReducer(d, { type: "setTerm", model: "semester", pick: 0 });
    expect(nextUnansweredBeat(d)).toBeNull();
    expect(INTERVIEW_BEATS).toHaveLength(8);
  });

  it("counts 'use my Google name' (an empty name) as answered", () => {
    const d = flowReducer(emptyDraft(), { type: "answerIntro", founderName: "" });
    expect(nextUnansweredBeat(d)).toBe("kind");
  });
});

describe("term on the charter", () => {
  it("clamps hand-edited dates so the end is never before the start", () => {
    const d = run([
      { type: "answerKind", kind: "club", text: null },
      { type: "setTermDates", startDate: "2026-09-01", endDate: "2026-08-01" },
    ]);
    expect(d.term?.startDate).toBe("2026-09-01");
    expect(d.term?.endDate).toBe("2026-09-01");
    expect(d.term?.pick).toBe(-1);
  });

  it("reaches the payload as blueprint.term with the period word, and parses", () => {
    const d = run([
      { type: "answerKind", kind: "team", text: null },
      { type: "answerMonth", acts: ["meetings"] },
      { type: "setTerm", model: "year-round", pick: 0 },
    ]);
    const input = draftToCreateOrgInput(d, "Priya Shah");
    expect(input.blueprint?.term).toEqual({ label: d.term!.label, startDate: d.term!.startDate, endDate: d.term!.endDate });
    expect(input.blueprint?.vocabularyOverrides?.Period).toBe("Year");
    expect(createOrgInput.safeParse(input).success).toBe(true);
  });

  it("lets a founder-typed period word win over the term model's", () => {
    const d = run([
      { type: "answerKind", kind: "club", text: null },
      { type: "setVocab", key: "Period", value: "Cycle" },
    ]);
    expect(draftToCreateOrgInput(d).blueprint?.vocabularyOverrides?.Period).toBe("Cycle");
  });

  it("termFromSuggestion clamps an out-of-range slot", () => {
    expect(termFromSuggestion("year-round", 9, TODAY).label).toBe("2027");
  });
});

describe("drafts written before the paper flow", () => {
  it("still parse, reading as an interview that hasn't asked the new beats", () => {
    const old = { ...emptyDraft(), name: "Old" } as Record<string, unknown>;
    delete old.answers;
    delete old.thread;
    delete old.term;
    const parsed = parseDraft(JSON.stringify(old));
    expect(parsed).not.toBeNull();
    expect(parsed!.answers).toEqual({});
    expect(parsed!.thread).toEqual([]);
    expect(parsed!.term).toBeNull();
  });

  it("caps the transcript so a long session can't write an unparseable draft", () => {
    let d: Draft = emptyDraft();
    for (let i = 0; i < 40; i++) {
      d = flowReducer(d, { type: "say", lines: Array.from({ length: 5 }, () => ({ k: "bot" as const, t: "hi" })) });
    }
    expect(d.thread.length).toBe(160);
    expect(parseDraft(JSON.stringify(d))).not.toBeNull();
  });
});

describe("typed-answer readers", () => {
  it("reads money, and re-asks a hedge rather than guessing", () => {
    expect(readMoneyAnswer("yeah, dues every semester")).toBe("yes");
    expect(readMoneyAnswer("now and then for formals")).toBe("some");
    expect(readMoneyAnswer("nope, it's free")).toBe("none");
    expect(readMoneyAnswer("not sure")).toBeNull();
  });

  it("reads docs", () => {
    expect(readDocsAnswer("a drive folder")).toBe("yes");
    expect(readDocsAnswer("it's all over the place")).toBe("scattered");
    expect(readDocsAnswer("not really")).toBe("none");
    expect(readDocsAnswer("idk")).toBeNull();
  });

  it("strips greetings and lead-ins", () => {
    expect(readFounderName("hi, I'm priya shah.")).toBe("Priya Shah");
    expect(readFounderTitle("I'm the treasurer")).toBe("Treasurer");
  });
});
