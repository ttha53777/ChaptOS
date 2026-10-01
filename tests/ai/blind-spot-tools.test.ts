/**
 * The blind-spot read tools (custom metrics, member fields, polls,
 * reimbursements, dues payments, docs, announcement, join requests,
 * exemptions) answer only what the asker could see in the app:
 *
 *   1. GATES — join requests and exemptions refuse without the permission
 *      (and never touch the DB); other members' dues payments are filtered
 *      out AT THE QUERY for a non-treasurer; poll results stay sealed.
 *   2. SHAPE — member rows come back as {id, name} so answer rows can open
 *      the member; aggregates are computed over every match, not the page.
 *
 * Pure unit — a recording stub stands in for ctx.db.
 */

import { describe, it, expect } from "vitest";
import { runTool, type ToolAccess } from "@/lib/ai-tools";
import { PERMISSIONS } from "@/lib/permissions";
import type { db } from "@/lib/db";

type Scoped = ReturnType<typeof db>;
type Call = { model: string; op: string; args: unknown };

/** Every model answers from `data[model]`; every call is recorded. */
function stub(data: Record<string, unknown>, orgId = 7): { scoped: Scoped; calls: Call[]; orgId: number } {
  const calls: Call[] = [];
  const scoped = new Proxy({} as Record<string, unknown>, {
    get(_t, model: string) {
      return new Proxy({}, {
        get(_m, op: string) {
          return async (args: unknown) => {
            calls.push({ model, op, args });
            const v = data[model];
            if (op === "find") return v ?? null;
            if (op === "findFirst") return Array.isArray(v) ? v[0] ?? null : v ?? null;
            return v ?? [];
          };
        },
      });
    },
  }) as unknown as Scoped;
  return { scoped, calls, orgId };
}

// A fresh orgId per test keeps the per-org name cache from leaking between cases.
let nextOrg = 1000;
const ROSTER = [
  { brotherId: 1, name: null, brother: { name: "Rob Chen" } },
  { brotherId: 2, name: "Sam", brother: { name: "Samuel Ortiz" } },
];

const MEMBER: ToolAccess = { actorId: 2, permissions: 0, isOrgAdmin: false, isPlatformAdmin: false };
const TREASURER: ToolAccess = { ...MEMBER, permissions: PERMISSIONS.MANAGE_TREASURY };
const ADMIN: ToolAccess = { ...MEMBER, isOrgAdmin: true };

describe("permission-gated tools", () => {
  for (const tool of ["list_join_requests", "list_attendance_exemptions"]) {
    it(`${tool} refuses a plain member without querying`, async () => {
      const { scoped, calls, orgId } = stub({}, nextOrg++);
      const out = await runTool(tool, {}, scoped, orgId, undefined, MEMBER) as { error?: string };
      expect(out.error).toMatch(/permission/);
      expect(calls).toHaveLength(0);
    });

    it(`${tool} refuses when no asker is given (conservative default)`, async () => {
      const { scoped, orgId } = stub({}, nextOrg++);
      const out = await runTool(tool, {}, scoped, orgId) as { error?: string };
      expect(out.error).toMatch(/permission/);
    });
  }

  it("list_join_requests lets an org admin through, oldest pending first", async () => {
    const { scoped, calls, orgId } = stub({
      joinRequest: [{ name: "Pat", email: "p@x.edu", createdAt: new Date("2026-09-01"), decidedAt: null }],
    }, nextOrg++);
    const out = await runTool("list_join_requests", {}, scoped, orgId, undefined, ADMIN);
    expect(out).toEqual([{ name: "Pat", email: "p@x.edu", requested: "2026-09-01" }]);
    expect((calls[0].args as { where: unknown }).where).toEqual({ status: "pending" });
  });

  it("list_dues_payments scopes a non-treasurer to their own payments in the query", async () => {
    const { scoped, calls, orgId } = stub({ member: ROSTER, duesPayment: [] }, nextOrg++);
    const out = await runTool("list_dues_payments", {}, scoped, orgId, undefined, MEMBER) as { scope?: string };
    const q = calls.find(c => c.model === "duesPayment")!;
    expect((q.args as { where: { brotherId?: number } }).where.brotherId).toBe(2);
    expect(out.scope).toMatch(/own payments/);
  });

  it("list_dues_payments shows a treasurer everyone", async () => {
    const { scoped, calls, orgId } = stub({
      member: ROSTER,
      duesPayment: [
        { brotherId: 1, amount: 100, date: "2026-09-02", paymentMethod: "venmo", status: "approved" },
        { brotherId: 2, amount: 50, date: "2026-09-01", paymentMethod: null, status: "pending" },
      ],
    }, nextOrg++);
    const out = await runTool("list_dues_payments", {}, scoped, orgId, undefined, TREASURER) as {
      summary: { count: number; approvedTotal: number; pendingCount: number };
      payments: { id: number; name: string }[];
    };
    const q = calls.find(c => c.model === "duesPayment")!;
    expect((q.args as { where: { brotherId?: number } }).where.brotherId).toBeUndefined();
    expect(out.summary).toEqual({ count: 2, approvedTotal: 100, pendingCount: 1 });
    expect(out.payments.map(p => [p.id, p.name])).toEqual([[1, "Rob Chen"], [2, "Sam"]]);
  });
});

describe("list_polls reveal rule", () => {
  const POLL = {
    id: 1, question: "Formal date?", status: "open", closeDate: null,
    options: [{ id: 10, label: "Apr 4" }, { id: 11, label: "Apr 11" }],
    votes: [{ brotherId: 1, optionId: 10 }],
    assignments: [{ brotherId: 1 }, { brotherId: 2 }],
  };

  it("seals an open poll the asker hasn't voted in", async () => {
    const { scoped, orgId } = stub({ member: ROSTER, poll: [POLL] }, nextOrg++);
    const [p] = await runTool("list_polls", {}, scoped, orgId, undefined, MEMBER) as Record<string, unknown>[];
    expect(p.options).toEqual(["Apr 4", "Apr 11"]);
    expect(p.sealed).toBeTruthy();
    expect(p.notVoted).toBeUndefined();
  });

  it("shows a manager the tally and who hasn't voted", async () => {
    const { scoped, orgId } = stub({ member: ROSTER, poll: [POLL] }, nextOrg++);
    const [p] = await runTool("list_polls", {}, scoped, orgId, undefined, ADMIN) as Record<string, unknown>[];
    expect(p.options).toEqual([{ label: "Apr 4", votes: 1 }, { label: "Apr 11", votes: 0 }]);
    expect(p.notVoted).toEqual([{ id: 2, name: "Sam" }]);
    expect(p.eligible).toBe(2);
  });
});

describe("summaries cover every match", () => {
  it("list_reimbursements totals all matches, filters by member name, and keys rows by member id", async () => {
    const { scoped, orgId } = stub({
      member: ROSTER,
      reimbursement: [
        { id: 1, brotherId: 1, amount: 40, date: "2026-09-03", description: "Cups", category: null, status: "pending" },
        { id: 2, brotherId: 1, amount: 60, date: "2026-09-02", description: "Ice", category: "Social", status: "approved" },
        { id: 3, brotherId: 2, amount: 99, date: "2026-09-01", description: "Paint", category: null, status: "pending" },
      ],
    }, nextOrg++);
    const out = await runTool("list_reimbursements", { member: "rob", limit: 1 }, scoped, orgId, undefined, MEMBER) as {
      summary: { count: number; total: number; pendingTotal: number };
      reimbursements: { id: number; name: string }[];
    };
    expect(out.summary).toMatchObject({ count: 2, total: 100, pendingTotal: 40 });
    expect(out.reimbursements).toHaveLength(1);
    expect(out.reimbursements[0]).toMatchObject({ id: 1, name: "Rob Chen" });
  });

  it("get_custom_metrics buckets members by the metric's own thresholds", async () => {
    const { scoped, orgId } = stub({
      member: ROSTER,
      orgMetricDefinition: [{
        id: 5, name: "Study Hours", unit: "hrs", goal: 10, atRiskBelow: 4, watchBelow: null, aggregation: "avg",
        values: [{ brotherId: 1, value: 2 }, { brotherId: 99, value: 50 }], // 99 is off the roster
      }],
    }, nextOrg++);
    const out = await runTool("get_custom_metrics", { metric: "study" }, scoped, orgId) as {
      summary: { atRisk: number; onTrack: number; notRecorded: number; average: number };
      members: { id: number; status: string }[];
    };
    expect(out.summary).toMatchObject({ atRisk: 1, onTrack: 0, notRecorded: 1, average: 2 });
    expect(out.members.map(m => [m.id, m.status])).toEqual([[1, "at_risk"], [2, "missing"]]);
  });
});
