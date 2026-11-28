import { beforeEach, describe, expect, it, vi } from "vitest";

const runTool = vi.fn();
vi.mock("@/lib/ai-tools", () => ({ runTool: (...a: unknown[]) => runTool(...a) }));

import { BRIEF_DAYS, BRIEF_RULE, briefMessages, briefPlan, buildBrief } from "@/lib/ai-brief";

const scoped = {} as never;
const access = (actorId: number) => ({ actorId, permissions: 0, isOrgAdmin: false, isPlatformAdmin: false });

beforeEach(() => runTool.mockReset());

describe("briefPlan", () => {
  it("reads the asker, two weeks of calendar and deadlines, and the treasury", () => {
    const plan = briefPlan(7, new Date("2026-11-27T15:00:00Z"));
    expect(plan.map(p => p.name)).toEqual(["get_brother", "list_calendar_events", "list_deadlines", "get_treasury"]);
    expect(plan[0].args).toEqual({ id: 7 });
    expect(plan[1].args).toMatchObject({ start: "2026-11-27", end: "2026-12-10", order: "asc" });
    // Overdue work counts: no start on deadlines.
    expect(plan[2].args).toMatchObject({ end: "2026-12-10", open_only: true });
    expect(plan[2].args).not.toHaveProperty("start");
  });

  it("window is BRIEF_DAYS long, today included", () => {
    const [, cal] = briefPlan(1, new Date("2026-12-25T00:00:00Z"));
    const days = (Date.parse(cal.args.end as string) - Date.parse(cal.args.start as string)) / 864e5 + 1;
    expect(days).toBe(BRIEF_DAYS);
  });
});

describe("buildBrief", () => {
  it("runs each read with the asker's access, trims, and drops failed reads", async () => {
    runTool.mockImplementation(async (name: string) => {
      if (name === "get_brother") return { id: 3, name: "Rob", duesOwed: 120, email: "rob@example.com" };
      if (name === "get_treasury") return { balance: 900, recentTransactions: [1, 2, 3, 4, 5] };
      if (name === "list_deadlines") return { error: "boom" };
      return [{ id: 1, title: "Chapter Meeting", date: "2026-11-30" }];
    });
    const a = access(3);
    const brief = await buildBrief(scoped, 101, a, new Date("2026-11-27T00:00:00Z"));
    expect(runTool).toHaveBeenCalledTimes(4);
    for (const call of runTool.mock.calls) expect(call[5]).toBe(a);
    expect(brief!.calls.map(c => c.name)).toEqual(["get_brother", "list_calendar_events", "get_treasury"]);
    expect(brief!.calls[0].result).not.toHaveProperty("email");
    expect((brief!.calls[2].result as { recentTransactions: unknown[] }).recentTransactions).toHaveLength(3);
    expect(brief!.chars).toBeGreaterThan(0);
  });

  it("rewords an empty window's 'broaden' hint so the model doesn't search again and again", async () => {
    const empty = { count: 0, items: [], hint: "No rows matched these filters. Broaden — drop a filter or switch to a sort — before telling the user there are none." };
    runTool.mockImplementation(async (name: string) => (name === "list_calendar_events" || name === "list_deadlines" ? empty : { ok: 1 }));
    const brief = await buildBrief(scoped, 104, access(1));
    const cal = brief!.calls.find(c => c.name === "list_calendar_events")!.result as typeof empty;
    const dl = brief!.calls.find(c => c.name === "list_deadlines")!.result as typeof empty;
    expect(cal).toMatchObject({ count: 0, items: [] });
    expect(cal.hint).toMatch(/ONCE/);
    expect(dl.hint).toMatch(/complete answer/);
    expect(cal.hint).not.toMatch(/Broaden/);
  });

  it("is cached per asker, so a follow-up sends identical bytes", async () => {
    runTool.mockResolvedValue({ balance: 1 });
    const one = await buildBrief(scoped, 102, access(9));
    const two = await buildBrief(scoped, 102, access(9));
    expect(two).toBe(one);
    expect(runTool).toHaveBeenCalledTimes(4);
    await buildBrief(scoped, 102, access(10));
    expect(runTool).toHaveBeenCalledTimes(8);
  });

  it("is null when every read fails (tools answer {error}), so the turn runs as before", async () => {
    runTool.mockImplementation(() => Promise.resolve({ error: "db down" }));
    expect(await buildBrief(scoped, 103, access(1))).toBeNull();
  });
});

describe("briefMessages", () => {
  it("is one assistant turn of tool calls, then a tool message per read, ids matching", () => {
    const msgs = briefMessages({
      chars: 10,
      calls: [
        { id: "brief_0", name: "get_brother", args: { id: 1 }, result: { name: "A" } },
        { id: "brief_3", name: "get_treasury", args: {}, result: { balance: 5 } },
      ],
    });
    expect(msgs).toHaveLength(3);
    const [a, t0, t1] = msgs as unknown as Array<Record<string, unknown>>;
    expect(a.role).toBe("assistant");
    const calls = a.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>;
    expect(calls.map(c => c.id)).toEqual(["brief_0", "brief_3"]);
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ id: 1 });
    expect(t0).toMatchObject({ role: "tool", tool_call_id: "brief_0", content: '{"name":"A"}' });
    expect(t1).toMatchObject({ role: "tool", tool_call_id: "brief_3" });
  });

  it("the rule names every read the plan makes", () => {
    for (const p of briefPlan(1, new Date())) expect(BRIEF_RULE).toContain(p.name);
  });
});
