/**
 * Unit tests for the chatbot write-proposal surface (lib/ai-tools.ts).
 *
 * The whole design rests on one safety invariant: a `propose_*` tool NEVER writes
 * to the DB. It validates the model's arguments and returns either a Proposal (a
 * confirm card the client renders) or an { error }. Only when the user clicks
 * Confirm does the client POST to the real /api/* route, where the normal auth
 * gates decide if the write actually happens. So these tests assert:
 *
 *   1. every builder returns a {proposal | error} shape and performs no DB write
 *      (a Scoped mock whose mutation methods throw if touched);
 *   2. argument validation rejects out-of-range / over-length / bad-enum inputs
 *      as { error } rather than emitting a malformed proposal;
 *   3. proposeMarkDuesPaid (the only async builder) reads before-state to enrich
 *      the card but still only proposes.
 *
 * Pure unit — no real DB, no OpenAI. validateArgs is exercised directly too.
 */

import { describe, it, expect, vi } from "vitest";
import { runProposal, isProposalTool, validateArgs } from "@/lib/ai-tools";
import type { db } from "@/lib/db";

type Scoped = ReturnType<typeof db>;

/**
 * A Scoped stand-in that allows the single read the builders may perform
 * (brother.findFirst) and throws on ANY mutation method, so a stray write fails
 * the test loudly instead of silently. `duesBefore` controls the read result.
 */
function mockScoped(duesBefore: number | null = 135): { scoped: Scoped; findFirst: ReturnType<typeof vi.fn> } {
  const findFirst = vi.fn(async () => (duesBefore === null ? null : { duesOwed: duesBefore }));
  const explode = (op: string) => () => { throw new Error(`unexpected DB write: ${op}`); };
  // A Proxy so any model.method access resolves: reads return findFirst where
  // expected; every mutating verb throws.
  const model = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === "findFirst" || prop === "findUnique" || prop === "findMany") return findFirst;
      if (["create", "update", "delete", "upsert", "updateMany", "deleteMany", "createMany"].includes(prop)) {
        return explode(prop);
      }
      return undefined;
    },
  });
  const scoped = new Proxy({} as Record<string, unknown>, {
    get() { return model; },
  }) as unknown as Scoped;
  return { scoped, findFirst };
}

const ALL_PROPOSAL_TOOLS = [
  "propose_add_deadline",
  "propose_add_instagram_task",
  "propose_add_calendar_event",
  "propose_log_transaction",
  "propose_record_dues_payment",
  "propose_add_programming_event",
] as const;

/** Minimal VALID args per tool, used to assert the happy path produces a proposal. */
const VALID_ARGS: Record<string, Record<string, unknown>> = {
  propose_add_deadline:          { title: "Pay vendor", dueDate: "2026-07-01", assigneeBrotherId: 3 },
  propose_add_instagram_task:    { title: "Rush reel", dueDate: "2026-07-01", type: "Reel" },
  propose_add_calendar_event:    { title: "Chapter", date: "2026-07-01", category: "chapter" },
  propose_log_transaction:       { type: "expense", category: "Food", amount: 42.5, date: "2026-07-01", description: "pizza" },
  propose_record_dues_payment:   { brother_id: 3, brother_name: "Bryan" },
  propose_add_programming_event: { title: "Mixer", type: "Social" },
};

describe("registry", () => {
  it("recognizes every propose_* tool and rejects unknown / read tools", () => {
    for (const t of ALL_PROPOSAL_TOOLS) expect(isProposalTool(t)).toBe(true);
    expect(isProposalTool("list_brothers")).toBe(false);
    expect(isProposalTool("nonexistent")).toBe(false);
  });
});

describe("every builder proposes and never writes", () => {
  for (const tool of ALL_PROPOSAL_TOOLS) {
    it(`${tool}: valid args → proposal, no DB write`, async () => {
      const { scoped } = mockScoped();
      const out = await runProposal(tool, VALID_ARGS[tool], scoped);
      expect("error" in out).toBe(false);
      const proposal = out as Extract<typeof out, { kind: "proposal" }>;
      expect(proposal.kind).toBe("proposal");
      expect(proposal.action).toBe(tool);
      expect(["POST", "PATCH"]).toContain(proposal.method);
      expect(typeof proposal.endpoint).toBe("string");
      expect(proposal.endpoint.startsWith("/api/")).toBe(true);
      expect(typeof proposal.summary).toBe("string");
    });
  }

  it("unknown proposal name returns an error, not a throw", async () => {
    const { scoped } = mockScoped();
    const out = await runProposal("propose_nothing", {}, scoped);
    expect(out).toEqual({ error: expect.stringContaining("Unknown proposal") });
  });
});

describe("argument validation rejects malformed input as {error}", () => {
  it("missing required fields → error (not a partial proposal)", async () => {
    const { scoped } = mockScoped();
    // deadline requires title + dueDate
    expect(await runProposal("propose_add_deadline", { title: "x" }, scoped)).toHaveProperty("error");
    // instagram requires title + dueDate + type
    expect(await runProposal("propose_add_instagram_task", { title: "x", dueDate: "2026-07-01" }, scoped)).toHaveProperty("error");
  });

  it("invalid enum value → error", async () => {
    const { scoped } = mockScoped();
    const igBadType = await runProposal("propose_add_instagram_task", { title: "x", dueDate: "2026-07-01", type: "Tweet" }, scoped);
    expect(igBadType).toHaveProperty("error");
    const txBadType = await runProposal("propose_log_transaction", { type: "refund", category: "x", amount: 1, date: "2026-07-01", description: "d" }, scoped);
    expect(txBadType).toHaveProperty("error");
  });

  it("malformed date → error", async () => {
    const { scoped } = mockScoped();
    expect(await runProposal("propose_add_deadline", { title: "x", dueDate: "07/01/2026", assigneeBrotherId: 1 }, scoped)).toHaveProperty("error");
    expect(await runProposal("propose_add_calendar_event", { title: "x", date: "nope", category: "social" }, scoped)).toHaveProperty("error");
  });

  it("a deadline with no assignee → error (a task must have an owner)", async () => {
    const { scoped } = mockScoped();
    const out = await runProposal("propose_add_deadline", { title: "x", dueDate: "2026-07-01" }, scoped);
    expect(out).toHaveProperty("error");
  });

  it("over-length title / notes → error", async () => {
    const { scoped } = mockScoped();
    const longTitle = "x".repeat(201);
    expect(await runProposal("propose_add_deadline", { title: longTitle, dueDate: "2026-07-01", assigneeBrotherId: 1 }, scoped)).toHaveProperty("error");
    const longNotes = "y".repeat(2001);
    expect(await runProposal("propose_add_deadline", { title: "ok", dueDate: "2026-07-01", assigneeBrotherId: 1, notes: longNotes }, scoped)).toHaveProperty("error");
  });

  it("negative transaction amount → error", async () => {
    const { scoped } = mockScoped();
    const out = await runProposal("propose_log_transaction", { type: "income", category: "Dues", amount: -5, date: "2026-07-01", description: "d" }, scoped);
    expect(out).toHaveProperty("error");
  });

  it("chapter calendar event cannot be non-mandatory", async () => {
    const { scoped } = mockScoped();
    const out = await runProposal("propose_add_calendar_event", { title: "x", date: "2026-07-01", category: "chapter", mandatory: false }, scoped);
    expect(out).toHaveProperty("error");
  });
});

/**
 * This proposal used to point at `PATCH /api/brothers/:id` with `{ duesOwed: 0 }` — a flag
 * flip that zeroed the roster and wrote no Transaction, so every dollar collected this way
 * went unrecorded in the ledger. It now posts a "Dues" income transaction attributed to the
 * member (POST /api/transactions), which mints the ledger row and decrements the balance in
 * one DB transaction (createTransaction). The Ratify card is the review-before-write step.
 */
describe("proposeRecordDuesPayment — proposes a dues transaction, never writes", () => {
  it("targets the transactions endpoint with the full outstanding balance", async () => {
    const { scoped, findFirst } = mockScoped(135);
    const out = await runProposal("propose_record_dues_payment", { brother_id: 3, brother_name: "Bryan" }, scoped);
    expect("error" in out).toBe(false);
    const proposal = out as Extract<typeof out, { kind: "proposal" }>;
    expect(findFirst).toHaveBeenCalledOnce();
    expect(proposal.method).toBe("POST");
    expect(proposal.endpoint).toBe("/api/transactions");
    expect(proposal.payload).toMatchObject({ type: "income", category: "Dues", brotherId: 3, amount: 135 });
    expect(proposal.payload).toHaveProperty("date");
    expect(proposal.payload).toHaveProperty("description");
    // The card says it records the payment and lowers the balance.
    expect(proposal.summary).toContain("135");
    expect(proposal.summary).toContain("balance");
  });

  it("an explicit amount proposes a partial payment and names the remainder", async () => {
    const { scoped } = mockScoped(135);
    const out = await runProposal("propose_record_dues_payment", { brother_id: 3, brother_name: "Bryan", amount: 35 }, scoped);
    const proposal = out as Extract<typeof out, { kind: "proposal" }>;
    expect(proposal.payload).toMatchObject({ brotherId: 3, amount: 35 });
    expect(proposal.summary).toContain("100.00");   // 135 − 35 still owing
  });

  it("refuses to propose more than they owe (createTransaction would 409 anyway)", async () => {
    const { scoped } = mockScoped(50);
    const out = await runProposal("propose_record_dues_payment", { brother_id: 3, brother_name: "Bryan", amount: 100 }, scoped);
    expect(out).toHaveProperty("error");
  });

  it("refuses when they already owe nothing — there is no payment to record", async () => {
    const { scoped } = mockScoped(0);
    const out = await runProposal("propose_record_dues_payment", { brother_id: 3, brother_name: "Bryan" }, scoped);
    expect(out).toHaveProperty("error");
  });

  it("a read failure BLOCKS the proposal — the balance is now the amount, not decoration", async () => {
    // Previously this degraded to a plain summary and still proposed { duesOwed: 0 }. It
    // can't any more: without the balance there is no amount to pay, and guessing one
    // would put a wrong number in the ledger.
    const findFirst = vi.fn(async () => { throw new Error("db down"); });
    const model = new Proxy({} as Record<string, unknown>, {
      get(_t, prop: string) {
        if (prop === "findFirst") return findFirst;
        throw new Error(`unexpected DB op: ${prop}`);
      },
    });
    const scoped = new Proxy({} as Record<string, unknown>, { get() { return model; } }) as unknown as Scoped;

    const out = await runProposal("propose_record_dues_payment", { brother_id: 3, brother_name: "Bryan" }, scoped);
    expect(out).toHaveProperty("error");
  });

  it("missing brother_name → error before any read", async () => {
    const { scoped } = mockScoped();
    const out = await runProposal("propose_record_dues_payment", { brother_id: 3 }, scoped);
    expect(out).toHaveProperty("error");
  });
});

describe("validateArgs (direct)", () => {
  it("passes through when the tool has no schema", () => {
    expect(validateArgs("list_brothers", { status: "Any" })).toEqual({ ok: true });
  });

  it("enforces integer minimum/maximum on numeric props", () => {
    // list_brothers.limit has minimum 1, maximum 100.
    expect(validateArgs("list_brothers", { limit: 0 }).ok).toBe(false);
    expect(validateArgs("list_brothers", { limit: 500 }).ok).toBe(false);
    expect(validateArgs("list_brothers", { limit: 5 }).ok).toBe(true);
  });

  it("rejects a wrong-typed field", () => {
    expect(validateArgs("propose_add_deadline", { title: 123, dueDate: "2026-07-01" }).ok).toBe(false);
  });
});
