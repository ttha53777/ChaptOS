/**
 * Tests for POST/GET /api/ai/interview — the pre-auth interview interpreter.
 *
 * validateInterviewResult() is the security-critical seam (same posture as
 * validateRecommendation): every id/key in the model's raw output must be
 * intersected with the real registries before it reaches the client. Pure
 * function, no model. The route itself is tested with interpretInterview
 * mocked — it's pre-auth, so it can be invoked directly with a NextRequest.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, validateInterviewResult } from "@/app/api/ai/interview/route";
import type { RawInterviewResult } from "@/lib/ai";

vi.mock("@/lib/ai", () => ({
  aiEnabled: vi.fn(() => true),
  interpretInterview: vi.fn(async () => null),
}));

import { aiEnabled, interpretInterview } from "@/lib/ai";

const mockedEnabled = vi.mocked(aiEnabled);
const mockedInterpret = vi.mocked(interpretInterview);

beforeEach(() => {
  mockedEnabled.mockReturnValue(true);
  mockedInterpret.mockResolvedValue(null);
});

function raw(over: Partial<RawInterviewResult> = {}): RawInterviewResult {
  return {
    reply: "Got it.",
    addWorkflows: [],
    removeWorkflows: [],
    vocabulary: {},
    kind: null,
    variant: null,
    customMetrics: [],
    founderTitle: null,
    followUpQuestion: null,
    followUpChips: [],
    confidence: "high",
    termModel: null,
    termLabel: null,
    founderName: null,
    nextQuestion: null,
    nextChips: [],
    done: false,
    ...over,
  };
}

const INPUT = {
  answers: { kind: "fraternity" as const },
  transcript: [{ role: "q" as const, text: "What does it do?" }, { role: "user" as const, text: "stuff" }],
};

describe("validateInterviewResult", () => {
  it("drops hallucinated workflow ids and never removes always-on", () => {
    const out = validateInterviewResult(
      raw({
        addWorkflows: ["finance", "blockchain", "finance"],
        removeWorkflows: ["parties", "operations", "not-real"],
      }),
      INPUT,
    );
    expect(out.picks.addWorkflows).toEqual(["finance"]);
    expect(out.picks.removeWorkflows).toEqual(["parties"]);
  });

  it("keeps only real vocab keys, trimmed and capped at 40 chars", () => {
    const out = validateInterviewResult(
      raw({ vocabulary: { Member: `  ${"K".repeat(60)}  `, Bogus: "Nope", Period: "" } }),
      INPUT,
    );
    expect(out.picks.vocab.Member).toBe("K".repeat(40));
    expect(out.picks.vocab).not.toHaveProperty("Bogus");
    expect(out.picks.vocab).not.toHaveProperty("Period");
  });

  it("validates kind against KIND_IDS and variant against the resolved kind", () => {
    const good = validateInterviewResult(raw({ kind: "fraternity", variant: "professional" }), INPUT);
    expect(good.picks.kind).toBe("fraternity");
    expect(good.picks.variant).toBe("professional");

    const badKind = validateInterviewResult(raw({ kind: "cartel", variant: "professional" }), INPUT);
    expect(badKind.picks.kind).toBeNull();
    // Falls back to the prior kind (fraternity) — professional is still valid.
    expect(badKind.picks.variant).toBe("professional");

    // A variant that doesn't belong to the kind is dropped.
    const crossed = validateInterviewResult(
      raw({ kind: "team", variant: "professional" }),
      INPUT,
    );
    expect(crossed.picks.variant).toBeNull();

    // No kind anywhere → no variant can validate.
    const noKind = validateInterviewResult(raw({ variant: "professional" }), {
      answers: {},
      transcript: INPUT.transcript,
    });
    expect(noKind.picks.variant).toBeNull();
  });

  it("caps custom metrics at 3, trims names/units, drops empties", () => {
    const out = validateInterviewResult(
      raw({
        customMetrics: [
          { name: "  Chapter Points  ", unit: "  pts  " },
          { name: "", unit: "x" },
          { name: "A", unit: null },
          { name: "B", unit: "y".repeat(20) },
          { name: "C", unit: null },
        ],
      }),
      INPUT,
    );
    expect(out.picks.customMetrics).toEqual([
      { name: "Chapter Points", unit: "pts" },
      { name: "A", unit: null },
      { name: "B", unit: "y".repeat(10) },
    ]);
  });

  it("caps follow-up chips at 4, de-dupes, and drops the follow-up when the transcript is full", () => {
    const out = validateInterviewResult(
      raw({ followUpQuestion: "Dues?", followUpChips: ["Yes", "Yes", "No", "Maybe", "Kinda", "Extra"] }),
      INPUT,
    );
    expect(out.followUp).toEqual({ question: "Dues?", chips: ["Yes", "No", "Maybe", "Kinda"] });

    // roomForFollowUp needs transcript.length <= MAX_TRANSCRIPT - 2 (= 22).
    const full = validateInterviewResult(raw({ followUpQuestion: "Dues?", followUpChips: ["Yes"] }), {
      answers: {},
      transcript: Array.from({ length: 23 }, (_, i) => ({
        role: i % 2 ? ("user" as const) : ("q" as const),
        text: "x",
      })),
    });
    expect(full.followUp).toBeNull();
  });

  it("caps the reply and founder title lengths", () => {
    const out = validateInterviewResult(
      raw({ reply: "r".repeat(500), founderTitle: `  ${"T".repeat(80)}` }),
      INPUT,
    );
    expect(out.reply).toHaveLength(200);
    expect(out.picks.founderTitle).toHaveLength(60);
  });
});

describe("validateInterviewResult — concierge fields", () => {
  it("validates termModel against TERM_MODELS and resolves term server-side from the label", () => {
    // A real model + a label that matches one of that model's suggestions.
    const out = validateInterviewResult(raw({ termModel: "semester", termLabel: "fall 2026" }), INPUT);
    expect(out.picks.termModel).toBe("semester");
    expect(out.picks.term).toMatchObject({ label: "Fall 2026", startDate: "2026-08-24", endDate: "2026-12-18" });
  });

  it("drops a hallucinated termModel and never emits model-supplied dates", () => {
    const bad = validateInterviewResult(raw({ termModel: "lunar-cycle", termLabel: "Blood Moon" }), INPUT);
    expect(bad.picks.termModel).toBeNull();
    // No model + an unmatched label → no term at all (client asks deterministically).
    expect(bad.picks.term).toBeNull();
  });

  it("resolves the term against the prior termModel when the model omits one", () => {
    const out = validateInterviewResult(raw({ termLabel: "Fall 2026" }), {
      answers: { kind: "fraternity", termModel: "semester" },
      transcript: INPUT.transcript,
    });
    expect(out.picks.term).toMatchObject({ label: "Fall 2026" });
  });

  it("resolves a bare, yearless term label fuzzily ('the fall term' → Fall 2026)", () => {
    // Founders say "the fall term", not "Fall 2026" — the exact match would
    // miss, so the season-word fallback must still land the right window.
    const out = validateInterviewResult(raw({ termModel: "semester", termLabel: "the fall term" }), INPUT);
    expect(out.picks.term).toMatchObject({ label: "Fall 2026" });

    // A label with no overlap at all still safely yields null.
    const none = validateInterviewResult(raw({ termModel: "semester", termLabel: "the wet season" }), INPUT);
    expect(none.picks.term).toBeNull();
  });

  it("clamps founderName and maps the concierge next-question + done", () => {
    const out = validateInterviewResult(
      raw({ founderName: `  ${"N".repeat(140)}`, nextQuestion: "How does your year reset?", nextChips: ["Semesters", "Semesters", "Year-round"], done: false }),
      INPUT,
    );
    expect(out.picks.founderName).toHaveLength(120);
    expect(out.next).toEqual({ question: "How does your year reset?", chips: ["Semesters", "Year-round"] });
    expect(out.done).toBe(false);
  });

  it("suppresses next when the model signals done, and coerces done to a real boolean", () => {
    const out = validateInterviewResult(
      raw({ done: true, nextQuestion: "Anything else?", nextChips: ["No"], reply: "All set." }),
      INPUT,
    );
    expect(out.done).toBe(true);
    expect(out.next).toBeNull();
  });
});

describe("missingFields", () => {
  it("gates on kind, termModel, and term; ignores optional metrics/name/title", async () => {
    const { missingFields } = await import("@/app/create/_components/interview-ai");
    const { emptyDraft } = await import("@/lib/onboarding/draft");

    const empty = emptyDraft();
    expect(missingFields(empty)).toEqual(["kind", "termModel", "term"]);

    const partial = { ...empty, kind: "club" as const, termModel: "semester" as const };
    expect(missingFields(partial)).toEqual(["term"]);

    const full = {
      ...partial,
      term: { label: "Fall 2026", startDate: "2026-08-24", endDate: "2026-12-18" },
    };
    expect(missingFields(full)).toEqual([]);
  });
});

/* ─── Route ──────────────────────────────────────────────────────────────── */

let ipCounter = 0;
function buildPost(body: unknown, ip?: string): NextRequest {
  return new NextRequest("http://localhost/api/ai/interview", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip ?? `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  stage: "activity",
  orgName: "Kappa Sigma",
  answers: { kind: "fraternity", variant: "social", enabledWorkflows: ["members"], termModel: null },
  transcript: [
    { role: "q", text: "What does the org do?" },
    { role: "user", text: "we throw events and track dues" },
  ],
};

describe("POST /api/ai/interview", () => {
  it("returns enabled:false without calling the model when AI is off", async () => {
    mockedEnabled.mockReturnValue(false);
    const res = await POST(buildPost(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, result: null });
    expect(mockedInterpret).not.toHaveBeenCalled();
  });

  it("returns a validated result on a successful interpretation", async () => {
    mockedInterpret.mockResolvedValue(
      raw({
        reply: "No parties then.",
        removeWorkflows: ["parties", "hallucinated-id"],
        followUpQuestion: "Do you collect dues?",
        followUpChips: ["Yes", "No"],
      }),
    );
    const res = await POST(buildPost(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.result.picks.removeWorkflows).toEqual(["parties"]);
    expect(body.result.followUp).toEqual({ question: "Do you collect dues?", chips: ["Yes", "No"] });
  });

  it("returns result:null (not an error) when the model fails", async () => {
    mockedInterpret.mockResolvedValue(null);
    const res = await POST(buildPost(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, result: null });
  });

  it("400s on junk bodies and over-long transcripts", async () => {
    expect((await POST(buildPost({ nope: 1 }))).status).toBe(400);
    const long = {
      ...VALID_BODY,
      transcript: Array.from({ length: 25 }, () => ({ role: "user", text: "x" })),
    };
    expect((await POST(buildPost(long))).status).toBe(400);
  });

  it("429s past the per-minute IP limit", async () => {
    const ip = "10.99.99.99";
    let status = 200;
    for (let i = 0; i < 20; i++) {
      status = (await POST(buildPost(VALID_BODY, ip))).status;
      if (status === 429) break;
    }
    expect(status).toBe(429);
  });
});

describe("GET /api/ai/interview", () => {
  it("probes AI availability", async () => {
    const res = await GET(new NextRequest("http://localhost/api/ai/interview", {
      headers: { "x-forwarded-for": "10.42.0.1" },
    }));
    expect(await res.json()).toEqual({ enabled: true });
  });
});
