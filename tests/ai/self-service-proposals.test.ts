/**
 * Self-service proposals — the actions a plain member can take through Ask
 * Chapt on their OWN record (excuse, reimbursement, service hours, task done,
 * poll vote). They carry perm.name === null: never blocked, never signed, never
 * filed in Approvals. What these tests pin:
 *
 *   1. SELF — the payload can only ever describe the asker (brotherId comes
 *      from pctx.actorId, never the model), and the user's words are matched
 *      only against records the asker can act on (their tasks, their polls).
 *   2. NO GUESSING — the model passes words, never ids; different records that
 *      fit the words come back as a question, and a $/hours figure the user
 *      never typed is refused.
 *   3. PRECONDITIONS — the refusals the endpoint would give (duplicate excuse,
 *      closed poll, same vote, task already done) come back as { error } so
 *      the model explains instead of showing a card destined to fail.
 *   4. NO WRITES — every mutating verb on the stub throws.
 *
 * Pure unit — a stub stands in for ctx.db.
 */

import { describe, it, expect } from "vitest";
import { runProposal, PROPOSAL_META, TOOLS, isSelfServiceProposal, type ProposalCtx } from "@/lib/ai-tools";
import { matchIntent } from "@/lib/ai-fastpath";
import { recordChatApproval } from "@/lib/services/chat-approval-service";
import { PERMISSIONS } from "@/lib/permissions";
import { todayISO } from "@/lib/dates";
import type { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";

type Scoped = ReturnType<typeof db>;
type Proposal = Extract<Awaited<ReturnType<typeof runProposal>>, { kind: "proposal" }>;

const WRITES = new Set(["create", "update", "delete", "upsert", "updateMany", "deleteMany", "createMany"]);

/** Reads answer from `data[model]` (findMany → array, single reads → the row); writes throw. */
function stub(data: Record<string, unknown>): Scoped {
  return new Proxy({} as Record<string, unknown>, {
    get(_t, model: string) {
      return new Proxy({}, {
        get(_m, op: string) {
          if (WRITES.has(op)) return () => { throw new Error(`unexpected DB write: ${model}.${op}`); };
          return async () => {
            const v = data[model];
            if (op === "findMany") return Array.isArray(v) ? v : v ? [v] : [];
            return Array.isArray(v) ? v[0] ?? null : v ?? null;
          };
        },
      });
    },
  }) as unknown as Scoped;
}

const MEMBER: ProposalCtx = { orgId: 1, actorId: 7, permissions: 0, isOrgAdmin: false, isPlatformAdmin: false };

async function propose(tool: string, args: Record<string, unknown>, data: Record<string, unknown>, pctx = MEMBER) {
  return runProposal(tool, args, stub(data), pctx);
}
function ok(out: Awaited<ReturnType<typeof runProposal>>): Proposal {
  expect(out).not.toHaveProperty("error");
  return out as Proposal;
}

const today = todayISO();
const shift = (days: number) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// A weekly meeting (same title, many dates) plus a different event that shares a word.
const EVENTS = [
  { id: 10, title: "Chapter", date: shift(-7), category: "chapter" },
  { id: 11, title: "Chapter", date: shift(2), category: "chapter" },
  { id: 12, title: "Chapter", date: shift(9), category: "chapter" },
  { id: 20, title: "Formal", date: shift(2), category: "social" },
];
const SAID = (text: string): ProposalCtx => ({ ...MEMBER, userText: text });

describe("self-service shape", () => {
  it("every self-service tool is unpermissioned, approvable, and unsigned", async () => {
    const p = ok(await propose("propose_submit_excuse", { event: "chapter", reason: "Exam" }, { calendarEvent: EVENTS }));
    expect(p.perm).toEqual({ name: null, label: "Just you", canApprove: true });
    expect(p.sig).toBeNull();
    for (const t of ["propose_submit_excuse", "propose_request_reimbursement", "propose_log_my_service_hours", "propose_complete_task", "propose_cast_vote"]) {
      expect(PROPOSAL_META[t]?.perm, t).toBeNull();
      expect(isSelfServiceProposal(t), t).toBe(true);
    }
    expect(isSelfServiceProposal("propose_log_transaction")).toBe(false);
  });

  it("no self-service tool takes an id from the model", () => {
    for (const t of TOOLS) {
      if (t.type !== "function" || !isSelfServiceProposal(t.function.name)) continue;
      const props = Object.keys((t.function.parameters as { properties: object }).properties);
      expect(props.filter(k => /id$/i.test(k)), t.function.name).toEqual([]);
    }
  });
});

describe("propose_submit_excuse — finds the event from the user's words", () => {
  it("no date: the next upcoming meeting of that name, never a past one", async () => {
    const p = ok(await propose("propose_submit_excuse", { event: "chapter meeting", reason: "I have an exam" }, { calendarEvent: EVENTS }));
    expect(p.payload).toEqual({ calendarEventId: 11, reason: "I have an exam" });
    expect(p.display.rows.find(r => r.k === "Date")?.v).toBe(shift(2));
  });

  it("no date and only a past match: asks rather than excusing an event that already happened", async () => {
    const out = await propose("propose_submit_excuse", { event: "golf outing", reason: "work" }, { calendarEvent: [{ id: 40, title: "Golf Outing", date: shift(-24), category: "social" }] });
    expect((out as { error: string }).error).toMatch(new RegExp(`already past.*date=${shift(-24)}`));
  });

  it("a named day with a single event resolves even when the words don't match its title", async () => {
    const p = ok(await propose("propose_submit_excuse", { event: "meeting", date: shift(-7), reason: "sick" }, { calendarEvent: [EVENTS[0]] }));
    expect(p.payload).toMatchObject({ calendarEventId: 10 });
  });

  it("words that fit different events ask instead of guessing", async () => {
    const both = [{ id: 30, title: "Chapter Retreat", date: shift(3), category: "social" }, { id: 31, title: "Chapter Formal", date: shift(4), category: "social" }];
    const out = await propose("propose_submit_excuse", { event: "chapter", reason: "x" }, { calendarEvent: both });
    expect((out as { error: string }).error).toMatch(/several events.*Chapter Retreat.*Chapter Formal/);
  });

  it("refuses a second excuse while one is pending; an attendance manager's own approves on submit", async () => {
    const data = { calendarEvent: EVENTS, attendanceExcuse: [{ calendarEventId: 11, status: "pending" }] };
    expect((await propose("propose_submit_excuse", { event: "chapter", reason: "x" }, data) as { error: string }).error).toMatch(/already have an excuse pending/);
    const p = ok(await propose("propose_submit_excuse", { event: "chapter", reason: "x" }, data, { ...MEMBER, permissions: PERMISSIONS.MANAGE_ATTENDANCE }));
    expect(p.display.rows.find(r => r.k === "Review")?.v).toBe("Approved on submit");
  });

  it("nothing matching is an error naming what that day has", async () => {
    const out = await propose("propose_submit_excuse", { event: "rush", date: shift(2), reason: "x" }, { calendarEvent: [EVENTS[1], EVENTS[3]] });
    expect((out as { error: string }).error).toMatch(/That day has: Chapter; Formal/);
  });
});

describe("propose_request_reimbursement", () => {
  it("pins brotherId to the asker, whatever the model passes", async () => {
    const p = ok(await propose("propose_request_reimbursement", { amount: 42.5, description: "Pizza", brotherId: 3 }, {}, SAID("pay me back $42.50 for pizza")));
    expect(p.payload).toEqual({ brotherId: 7, amount: 42.5, date: today, description: "Pizza" });
  });

  it("refuses an amount the user never typed", async () => {
    const out = await propose("propose_request_reimbursement", { amount: 40, description: "Pizza" }, {}, SAID("reimburse me for the pizza"));
    expect((out as { error: string }).error).toMatch(/never stated 40/);
    ok(await propose("propose_request_reimbursement", { amount: 1200, description: "Venue" }, {}, SAID("I put $1,200 down on the venue")));
  });

  it("refuses a future date and a non-positive amount", async () => {
    expect(await propose("propose_request_reimbursement", { amount: 10, description: "x", date: "2999-01-01" }, {})).toHaveProperty("error");
    expect(await propose("propose_request_reimbursement", { amount: 0, description: "x" }, {})).toHaveProperty("error");
  });
});

describe("propose_log_my_service_hours", () => {
  const SVC = [
    { id: 4, title: "Food bank", date: shift(-10), location: null },
    { id: 5, title: "Food bank", date: shift(-3), location: null },
  ];

  it("no date: the most recent one; posts to the self route and says what it replaces", async () => {
    const p = ok(await propose("propose_log_my_service_hours", { event: "food bank", hours: 3 }, { serviceEvent: SVC, serviceParticipation: [{ serviceEventId: 5, hours: 2 }] }, SAID("I did three hours at the food bank")));
    expect(p.endpoint).toBe("/api/service-events/5/participation/me");
    expect(p.payload).toEqual({ hours: 3 });
    expect(p.display.rows.find(r => r.k === "Replaces")?.v).toBe("2 hours");
  });

  it("refuses hours the user never gave, and hours already on file", async () => {
    expect((await propose("propose_log_my_service_hours", { event: "food bank", hours: 2 }, { serviceEvent: SVC }, SAID("log my food bank hours")) as { error: string }).error).toMatch(/never stated 2/);
    const out = await propose("propose_log_my_service_hours", { event: "food bank", hours: 2 }, { serviceEvent: SVC, serviceParticipation: [{ serviceEventId: 5, hours: 2 }] });
    expect((out as { error: string }).error).toMatch(/already have 2 hours/);
  });
});

describe("propose_complete_task — matches only the asker's own open tasks", () => {
  const TASKS = [
    { id: 5, title: "Print flyer", dueDate: shift(1), assignments: [{ brotherId: null, roleId: 20 }] },
    { id: 6, title: "Order flyer paper", dueDate: shift(3), assignments: [{ brotherId: 99, roleId: null }] },
    { id: 7, title: "Book venue", dueDate: shift(5), assignments: [{ brotherId: 7, roleId: null }] },
  ];

  it("'the flyers' lands on the asker's flyer task (via a held role), not someone else's", async () => {
    const p = ok(await propose("propose_complete_task", { task: "the flyers" }, { task: TASKS, brotherRole: [{ roleId: 20 }] }));
    expect(p.method).toBe("PATCH");
    expect(p.endpoint).toBe("/api/tasks/5");
    expect(p.payload).toEqual({ status: "done" });
  });

  it("a task manager matching two tasks is asked which", async () => {
    const out = await propose("propose_complete_task", { task: "flyer" }, { task: TASKS, brotherRole: [] }, { ...MEMBER, permissions: PERMISSIONS.MANAGE_TASKS });
    expect((out as { error: string }).error).toMatch(/several open tasks.*Print flyer.*Order flyer paper/);
  });

  it("no match lists the asker's own open tasks only", async () => {
    const out = await propose("propose_complete_task", { task: "budget" }, { task: TASKS, brotherRole: [] });
    const err = (out as { error: string }).error;
    expect(err).toMatch(/Book venue/);
    expect(err).not.toMatch(/flyer/);
  });
});

describe("propose_cast_vote", () => {
  const poll = (over: Record<string, unknown> = {}) => ({
    id: 3, question: "Formal date?",
    options: [{ id: 31, label: "Apr 4" }, { id: 32, label: "Apr 11" }, { id: 33, label: "May 2" }],
    assignments: [{ brotherId: 7, roleId: null }],
    votes: [],
    ...over,
  });
  const other = poll({ id: 4, question: "Philanthropy pick?", options: [{ id: 41, label: "Food bank" }, { id: 42, label: "Beach cleanup" }] });

  it("no poll named: the one whose options fit the pick", async () => {
    const p = ok(await propose("propose_cast_vote", { option: "may 2" }, { poll: [poll(), other], brotherRole: [] }));
    expect(p.payload).toEqual({ optionId: 33 });
    expect(p.endpoint).toBe("/api/polls/3/vote");
  });

  it("'B' and 'the second one' pick by position", async () => {
    expect(ok(await propose("propose_cast_vote", { poll: "formal", option: "B" }, { poll: [poll()] })).payload).toEqual({ optionId: 32 });
    expect(ok(await propose("propose_cast_vote", { poll: "formal", option: "the second one" }, { poll: [poll()] })).payload).toEqual({ optionId: 32 });
  });

  it("an ambiguous pick lists the options instead of guessing", async () => {
    const out = await propose("propose_cast_vote", { poll: "formal", option: "apr" }, { poll: [poll()] });
    expect((out as { error: string }).error).toMatch(/Apr 4 \| Apr 11 \| May 2/);
  });

  it("a changed vote names what it replaces; the same vote is refused", async () => {
    const p = ok(await propose("propose_cast_vote", { option: "Apr 11" }, { poll: [poll({ votes: [{ optionId: 31 }] })] }));
    expect(p.display.rows.find(r => r.k === "Replaces")?.v).toBe("Apr 4");
    expect(await propose("propose_cast_vote", { option: "Apr 4" }, { poll: [poll({ votes: [{ optionId: 31 }] })] })).toHaveProperty("error");
  });

  it("polls not assigned to the asker are never candidates", async () => {
    const out = await propose("propose_cast_vote", { option: "May 2" }, { poll: [poll({ assignments: [{ brotherId: 1, roleId: null }] })], brotherRole: [] });
    expect((out as { error: string }).error).toMatch(/no open polls assigned to you/);
  });
});

describe("approvals record", () => {
  it("refuses to record a self-service action before touching the DB", async () => {
    const ctx = { db: stub({}), permissions: 0, isOrgAdmin: true, isPlatformAdmin: false } as unknown as RequestContext;
    await expect(recordChatApproval(ctx, {
      action: "propose_submit_excuse", endpoint: "/api/excuses", method: "POST",
      payload: {}, display: { kind: "timeline", title: "x", rows: [] }, iat: Date.now(), sig: "00",
    } as never)).rejects.toThrow(/Self-service/);
  });
});

describe("fast-path steps aside for self-service asks", () => {
  it("an excuse or reimbursement request never gets a canned read answer", () => {
    expect(matchIntent("I can't make anything on the calendar this week")).toBeNull();
    expect(matchIntent("reimburse me for the dues table snacks")).toBeNull();
    expect(matchIntent("what's happening this week?")).not.toBeNull();
  });
});
