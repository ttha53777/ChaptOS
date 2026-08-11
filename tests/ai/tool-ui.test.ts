/**
 * The reasoning-ledger contract (lib/ai-tools.ts TOOL_UI + PROPOSAL_META):
 *
 *   1. COMPLETENESS — every tool the model can call has a ledger verb; every
 *      read tool has a Consulted/Sources chip label; every proposal tool has
 *      its authority mapped. A new tool can't ship invisible to the ledger.
 *   2. FINDINGS — the mono figures a step posts derive from the REAL tool
 *      result shape (never model-claimed), and fail null on errors.
 *   3. compose_answer parsing — caps, malformed-row dropping, verdict required.
 *   4. PERMISSION GATE — a non-holder's proposal resolves canApprove=false and
 *      names who does hold the permission; org admins bypass the bit check.
 *
 * Pure unit — no real DB, no OpenAI.
 */

import { describe, it, expect } from "vitest";
import {
  TOOLS,
  TOOL_UI,
  PROPOSAL_META,
  isReadTool,
  isProposalTool,
  isAnswerTool,
  parseComposeAnswer,
  runProposal,
  type ProposalCtx,
} from "@/lib/ai-tools";
import { PERMISSIONS } from "@/lib/permissions";
import type { db } from "@/lib/db";

type Scoped = ReturnType<typeof db>;

const toolNames = TOOLS.flatMap(t => (t.type === "function" ? [t.function.name] : []));

describe("TOOL_UI / PROPOSAL_META completeness", () => {
  it("every tool has a ledger verb", () => {
    for (const n of toolNames) expect(TOOL_UI[n]?.verb, n).toBeTruthy();
  });

  it("every read tool has a source chip label", () => {
    for (const n of toolNames.filter(isReadTool)) expect(TOOL_UI[n]?.source, n).toBeTruthy();
  });

  it("every proposal tool has its authority mapped", () => {
    for (const n of toolNames.filter(isProposalTool)) {
      const meta = PROPOSAL_META[n];
      expect(meta, n).toBeTruthy();
      expect(PERMISSIONS[meta.perm], n).toBeTruthy();
      expect(meta.label, n).toBeTruthy();
      expect(meta.title, n).toBeTruthy();
    }
  });

  it("no orphan entries name tools that don't exist", () => {
    for (const n of Object.keys(TOOL_UI)) expect(toolNames, `TOOL_UI.${n}`).toContain(n);
    for (const n of Object.keys(PROPOSAL_META)) expect(toolNames, `PROPOSAL_META.${n}`).toContain(n);
  });

  it("every tool is classified exactly one way (read | proposal | answer)", () => {
    for (const n of toolNames) {
      const kinds = [isReadTool(n), isProposalTool(n), isAnswerTool(n)].filter(Boolean).length;
      expect(kinds, n).toBe(1);
    }
  });
});

describe("findings derive from real result shapes", () => {
  it("list_brothers: member count, and owes summary under the dues filter", () => {
    const f = TOOL_UI.list_brothers.finding!;
    const result = { summary: { count: 34, owingCount: 6, totalDuesOwed: 1150 }, brothers: [] };
    expect(f(result, {})).toBe("34 members");
    expect(f(result, { owes_dues_only: true })).toBe("6 owe · $1,150");
    expect(f({ error: "boom" }, {})).toBeNull();
  });

  it("count-style tools: arrays, singulars, irregular plurals, empty envelopes", () => {
    expect(TOOL_UI.list_calendar_events.finding!([1, 2, 3], {})).toBe("3 events");
    expect(TOOL_UI.list_deadlines.finding!([1], {})).toBe("1 deadline");
    expect(TOOL_UI.list_parties.finding!([1, 2], {})).toBe("2 parties");
    expect(TOOL_UI.recent_activity.finding!([1, 2], {})).toBe("2 entries");
    expect(TOOL_UI.list_calendar_events.finding!({ count: 0, items: [], hint: "" }, {})).toBe("none found");
  });

  it("money and attendance shapes", () => {
    expect(TOOL_UI.get_treasury.finding!({ balance: 4820 }, {})).toBe("$4,820 on hand");
    expect(TOOL_UI.sum_transactions.finding!({ totals: { net: 640, count: 12 } }, {})).toBe("net +$640");
    expect(TOOL_UI.sum_transactions.finding!({ totals: { net: -640.5, count: 12 } }, {})).toBe("net −$640.50");
    expect(TOOL_UI.sum_transactions.finding!({ totals: { net: 0, count: 0 } }, {})).toBe("no transactions");
    expect(TOOL_UI.get_event_attendance.finding!({ counts: { attended: 28, absent: 6 } }, {})).toBe("28 of 34 attended");
    expect(TOOL_UI.get_brother_attendance.finding!({ counts: { missed: 2, total: 9 } }, {})).toBe("2 of 9 missed");
  });
});

describe("parseComposeAnswer", () => {
  it("verdict is required", () => {
    expect(parseComposeAnswer({})).toHaveProperty("error");
    expect(parseComposeAnswer({ verdict: "   " })).toHaveProperty("error");
  });

  it("caps rows at 6 / follows at 3 and drops malformed entries", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ kind: "person", title: `P${i}` }));
    const out = parseComposeAnswer({
      verdict: "Six owe *$1,150*.",
      rows: [...rows, { kind: "person" /* no title → dropped */ }, "garbage"],
      follows: [
        { label: "A", ask: "a?" }, { label: "B", ask: "b?" },
        { label: "C", ask: "c?" }, { label: "D", ask: "d?" },
        { label: "no-ask" },
      ],
    });
    expect(out).not.toHaveProperty("error");
    const a = out as Exclude<typeof out, { error: string }>;
    expect(a.rows.length).toBe(6);
    expect(a.follows.length).toBe(3);
  });

  it("unknown row kind degrades to generic", () => {
    const out = parseComposeAnswer({ verdict: "v", rows: [{ kind: "alien", title: "T" }] });
    const a = out as Exclude<typeof out, { error: string }>;
    expect(a.rows[0].kind).toBe("generic");
  });

  // A verdict that counts its own list can contradict the list the user is
  // looking at — "3 next-event ideas" over four rows. Rejected so the model
  // retries; the ordinary headline figure must survive untouched.
  describe("verdict miscounts its own rows", () => {
    const rowsOf = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ kind: "event", title: `E${i}` }));

    it("rejects a self-count that disagrees with rows", () => {
      expect(parseComposeAnswer({
        verdict: "Based on what you've hosted, here are 3 next-event ideas.",
        rows: rowsOf(4),
      })).toHaveProperty("error");
      expect(parseComposeAnswer({
        verdict: "Three ideas that match your track record.",
        rows: rowsOf(4),
      })).toHaveProperty("error");
      // Over-claiming past the 6-row cap is just as visible.
      expect(parseComposeAnswer({
        verdict: "*8* options worth running.",
        rows: rowsOf(8),
      })).toHaveProperty("error");
    });

    it("accepts a self-count that matches", () => {
      expect(parseComposeAnswer({
        verdict: "Here are *3* ideas that fit your track record.",
        rows: rowsOf(3),
      })).not.toHaveProperty("error");
    });

    it("leaves an ordinary headline figure alone", () => {
      // Rows are a truncated sample of a bigger set — not a count of the list.
      expect(parseComposeAnswer({
        verdict: "*12* brothers are behind on dues.",
        rows: rowsOf(6),
      })).not.toHaveProperty("error");
      expect(parseComposeAnswer({
        verdict: "You've spent *$4,200* across 21 events.",
        rows: rowsOf(5),
      })).not.toHaveProperty("error");
    });
  });

  // Advisory rows are ranked and the tier column is that ranking made visible,
  // so the two must agree on screen.
  describe("advisory rows", () => {
    const advisory = (tiers: Array<string | undefined>) => ({
      verdict: "Start with the *dashboard*.",
      rows: tiers.map((tier, i) => ({
        kind: "generic", title: `Fix ${i}`, ...(tier ? { tier } : {}),
      })),
    });

    it("rejects a tier that improves further down the list", () => {
      const out = parseComposeAnswer(advisory(["high", "later", "high"]));
      expect(out).toHaveProperty("error");
      expect((out as { error: string }).error).toMatch(/ranked best-first/);
    });

    it("accepts non-increasing tiers, including repeats", () => {
      expect(parseComposeAnswer(advisory(["high", "high", "medium", "later"])))
        .not.toHaveProperty("error");
    });

    it("ignores untiered rows when checking order", () => {
      // A mixed list still only constrains the rows that actually claim a tier.
      expect(parseComposeAnswer(advisory(["high", undefined, "medium"])))
        .not.toHaveProperty("error");
    });

    it("keeps a known screen key and drops an unknown one", () => {
      const out = parseComposeAnswer({
        verdict: "Start with the *dashboard*.",
        rows: [
          { kind: "generic", title: "A", screen: "dues" },
          { kind: "generic", title: "B", screen: "https://evil.example/steal" },
          { kind: "generic", title: "C", screen: "../../etc/passwd" },
        ],
      });
      const a = out as Exclude<typeof out, { error: string }>;
      expect(a.rows[0].screen).toBe("dues");
      // Anything not in SCREEN_PATHS never reaches the client as a link target.
      expect(a.rows[1].screen).toBeUndefined();
      expect(a.rows[2].screen).toBeUndefined();
    });

    it("drops an unknown tier rather than failing the answer", () => {
      const out = parseComposeAnswer({
        verdict: "v", rows: [{ kind: "generic", title: "A", tier: "critical" }],
      });
      const a = out as Exclude<typeof out, { error: string }>;
      expect(a.rows[0].tier).toBeUndefined();
    });
  });

  describe("askback", () => {
    it("parses questions and caps at 2, chips at 5", () => {
      const out = parseComposeAnswer({
        verdict: "Start with the *dashboard*.",
        askback: {
          lead: "Tell me two things.",
          questions: [
            { question: "What do you run most?", chips: ["Dues", "Events", "A", "B", "C", "D"] },
            { question: "What's slowest?", chips: ["Chasing", "Entry"] },
            { question: "Third?", chips: ["x", "y"] },
          ],
        },
      });
      const a = out as Exclude<typeof out, { error: string }>;
      expect(a.askback?.lead).toBe("Tell me two things.");
      expect(a.askback?.questions.length).toBe(2);
      expect(a.askback?.questions[0].chips.length).toBe(5);
    });

    it("drops a question with fewer than 2 chips — one chip isn't a choice", () => {
      const out = parseComposeAnswer({
        verdict: "v",
        askback: { questions: [{ question: "Only one?", chips: ["Yes"] }] },
      });
      const a = out as Exclude<typeof out, { error: string }>;
      expect(a.askback).toBeUndefined();
    });

    it("a malformed askback costs the block, not the answer", () => {
      const out = parseComposeAnswer({ verdict: "v", askback: "garbage" });
      expect(out).not.toHaveProperty("error");
      expect((out as Exclude<typeof out, { error: string }>).askback).toBeUndefined();
    });
  });
});

// ── Permission gate ──────────────────────────────────────────────────────────

/** Scoped mock exposing an org's roles for the holder lookup; throws on writes. */
function rolesScoped(roles: Array<{ name: string; rank: number; permissions: number; holders: string[] }>): Scoped {
  const model = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === "findMany") {
        return async () => roles.map(r => ({
          name: r.name,
          rank: r.rank,
          permissions: r.permissions,
          brothers: r.holders.map(name => ({ brother: { name, isGhost: false } })),
        }));
      }
      if (prop === "findFirst") return async () => null;
      return () => { throw new Error(`unexpected DB op: ${prop}`); };
    },
  });
  return new Proxy({} as Record<string, unknown>, { get() { return model; } }) as unknown as Scoped;
}

const TX_ARGS = { type: "expense", category: "Ops", amount: 20, date: "2026-07-24", description: "tape" };

// findPermHolders caches per orgId:perm for 5 min — every test uses a fresh
// orgId so a prior test's holders can't leak in.
let nextOrgId = 9000;
const gateCtx = (permissions: number, extra?: Partial<ProposalCtx>): ProposalCtx => ({
  orgId: nextOrgId++, actorId: 3, permissions, isOrgAdmin: false, isPlatformAdmin: false, ...extra,
});

describe("permission gate on proposals", () => {
  it("a non-holder's draft is blocked and names who holds the permission", async () => {
    const scoped = rolesScoped([
      { name: "Treasurer", rank: 5, permissions: PERMISSIONS.MANAGE_TREASURY, holders: ["Jordan P."] },
      { name: "Historian", rank: 1, permissions: 0, holders: ["Devon R."] },
    ]);
    const out = await runProposal("propose_log_transaction", TX_ARGS, scoped, gateCtx(PERMISSIONS.MANAGE_TASKS));
    expect(out).not.toHaveProperty("error");
    const p = out as Extract<typeof out, { kind: "proposal" }>;
    expect(p.perm.canApprove).toBe(false);
    expect(p.perm.holders?.roleTitles).toEqual(["Treasurer"]);
    expect(p.perm.holders?.memberName).toBe("Jordan P.");
  });

  it("a holder self-approves — no holder lookup, canApprove true", async () => {
    const scoped = rolesScoped([]); // any role read would return no holders; must not matter
    const out = await runProposal("propose_log_transaction", TX_ARGS, scoped, gateCtx(PERMISSIONS.MANAGE_TREASURY));
    const p = out as Extract<typeof out, { kind: "proposal" }>;
    expect(p.perm.canApprove).toBe(true);
    expect(p.perm.holders).toBeUndefined();
  });

  it("org admins approve regardless of bits", async () => {
    const out = await runProposal("propose_log_transaction", TX_ARGS, rolesScoped([]), gateCtx(0, { isOrgAdmin: true }));
    expect((out as Extract<typeof out, { kind: "proposal" }>).perm.canApprove).toBe(true);
  });
});
