/**
 * Tests for the Editorial Ballot's server-enforced seal (poll-service buildDTOs).
 *
 * A poll is a BLIND ballot: per-option `voteCount` is withheld (null) from a
 * viewer until they have voted, the poll closes, or they can manage polls.
 * `totalVotes` (the "N sealed" count) always ships. Managers (MANAGE_POLLS) are
 * never sealed and additionally get a `pendingVoters` roster — the assignees,
 * with roles expanded to current holders, who have not voted — on EVERY poll,
 * even ones they didn't assign. The route layer is thin; these drive the service.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import { createPoll, castVote, closePoll, listPolls } from "@/lib/services/poll-service";
import { PERMISSIONS } from "@/lib/permissions";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

/** Context for an actor. Defaults to a plain member (no perms, not admin). */
function ctxFor(orgId: number, actorId: number, over: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     0,
    maxRank:         0,
    isOrgAdmin:      false,
    isPlatformAdmin: false,
    db:              db(orgId),
    ...over,
  };
}

/** Org + an active year-wide semester + an admin (poll manager) actor. */
async function seedOrg(slug = "poll-org") {
  const org = await createOrg("Poll Org", slug);
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  await createSemester({ orgId: org.id, startDate: "2026-01-01", endDate: "2026-12-31" });
  return { org, admin, adminCtx: ctxFor(org.id, admin.id, { isOrgAdmin: true }) };
}

function createRole(orgId: number, name = "Voters") {
  return testPrisma.role.create({ data: { organizationId: orgId, name } });
}
function grantRole(orgId: number, brotherId: number, roleId: number) {
  return testPrisma.brotherRole.create({ data: { organizationId: orgId, brotherId, roleId } });
}
function one<T>(list: T[]): T {
  if (list.length !== 1) throw new Error(`expected exactly one, got ${list.length}`);
  return list[0];
}

// ---------------------------------------------------------------------------
// The seal, from a regular voter's point of view
// ---------------------------------------------------------------------------

describe("blind ballot — regular voter", () => {
  it("withholds per-option counts until the voter casts, then reveals them", async () => {
    const { org, adminCtx } = await seedOrg();
    const voter = await createBrother({ orgId: org.id });
    const poll = await createPoll(adminCtx, {
      question: "What's the theme?", options: ["Arcade", "Luau"],
      assigneeBrotherIds: [voter.id], assigneeRoleIds: [],
    });

    const voterCtx = ctxFor(org.id, voter.id);
    const before = one(await listPolls(voterCtx, { mine: true }));
    expect(before.sealed).toBe(true);
    expect(before.options.every(o => o.voteCount === null)).toBe(true);
    expect(before.totalVotes).toBe(0);       // the "N sealed" count still ships
    expect(before.assigneeCount).toBe(1);
    expect(before.myVoteOptionId).toBeNull();
    expect(before.pendingVoters).toBeUndefined();

    const arcadeId = before.options[0].id;
    await castVote(voterCtx, poll.id, arcadeId);

    const after = one(await listPolls(voterCtx, { mine: true }));
    expect(after.sealed).toBe(false);
    expect(after.options.find(o => o.id === arcadeId)?.voteCount).toBe(1);
    expect(after.totalVotes).toBe(1);
    expect(after.myVoteOptionId).toBe(arcadeId);
  });

  it("stays sealed for a non-assignee on an open poll, then reveals once closed", async () => {
    const { org, adminCtx } = await seedOrg();
    const voter = await createBrother({ orgId: org.id });
    const bystander = await createBrother({ orgId: org.id }); // can read, not assigned
    const poll = await createPoll(adminCtx, {
      question: "Q", options: ["A", "B"], assigneeBrotherIds: [voter.id], assigneeRoleIds: [],
    });
    await castVote(ctxFor(org.id, voter.id), poll.id, one(await listPolls(ctxFor(org.id, voter.id), { mine: true })).options[0].id);

    const bystanderCtx = ctxFor(org.id, bystander.id);
    const open = one(await listPolls(bystanderCtx));
    expect(open.sealed).toBe(true);
    expect(open.options.every(o => o.voteCount === null)).toBe(true);
    expect(open.totalVotes).toBe(1); // total is visible even while sealed

    await closePoll(adminCtx, poll.id);
    const closed = one(await listPolls(bystanderCtx));
    expect(closed.sealed).toBe(false);
    expect(closed.options.every(o => o.voteCount !== null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The manager carve-out
// ---------------------------------------------------------------------------

describe("manager visibility (MANAGE_POLLS)", () => {
  it("sees tallies and the non-voter roster (roles expanded) on a poll it didn't assign", async () => {
    const { org, adminCtx } = await seedOrg();
    const role = await createRole(org.id);
    const alice = await createBrother({ orgId: org.id, name: "Alice" });
    const bob = await createBrother({ orgId: org.id, name: "Bob" });
    await grantRole(org.id, alice.id, role.id);
    await grantRole(org.id, bob.id, role.id);

    const poll = await createPoll(adminCtx, {
      question: "Q", options: ["A", "B"], assigneeBrotherIds: [], assigneeRoleIds: [role.id],
    });

    // Alice votes; Bob does not.
    const aliceCtx = ctxFor(org.id, alice.id);
    const aliceView = one(await listPolls(aliceCtx, { mine: true }));
    await castVote(aliceCtx, poll.id, aliceView.options[0].id);

    // A manager who is NOT an assignee.
    const mgr = await createBrother({ orgId: org.id });
    const mgrCtx = ctxFor(org.id, mgr.id, { permissions: PERMISSIONS.MANAGE_POLLS });
    const view = one(await listPolls(mgrCtx));

    expect(view.sealed).toBe(false);                              // never sealed
    expect(view.options.every(o => o.voteCount !== null)).toBe(true);
    expect(view.assigneeCount).toBe(2);                           // role expanded to Alice + Bob
    expect(view.totalVotes).toBe(1);
    expect(view.pendingVoters).toBeDefined();
    expect(view.pendingVoters?.map(v => v.brotherId)).toEqual([bob.id]); // only Bob is out
    expect(view.pendingVoters?.[0].name).toBe("Bob");
  });

  it("reports an empty pendingVoters roster once everyone has voted", async () => {
    const { org, adminCtx } = await seedOrg();
    const voter = await createBrother({ orgId: org.id });
    const poll = await createPoll(adminCtx, {
      question: "Q", options: ["A", "B"], assigneeBrotherIds: [voter.id], assigneeRoleIds: [],
    });
    const voterCtx = ctxFor(org.id, voter.id);
    await castVote(voterCtx, poll.id, one(await listPolls(voterCtx, { mine: true })).options[0].id);

    const mgr = await createBrother({ orgId: org.id });
    const mgrCtx = ctxFor(org.id, mgr.id, { permissions: PERMISSIONS.MANAGE_POLLS });
    const view = one(await listPolls(mgrCtx));
    expect(view.pendingVoters).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

describe("tenancy", () => {
  it("a manager in another org sees none of this org's polls", async () => {
    const { org, adminCtx } = await seedOrg("org-a");
    const voter = await createBrother({ orgId: org.id });
    await createPoll(adminCtx, {
      question: "Ours", options: ["A", "B"], assigneeBrotherIds: [voter.id], assigneeRoleIds: [],
    });

    const otherOrg = await createOrg("Other", "org-b");
    const otherMgr = await createBrother({ orgId: otherOrg.id });
    const otherMgrCtx = ctxFor(otherOrg.id, otherMgr.id, { permissions: PERMISSIONS.MANAGE_POLLS });

    expect(await listPolls(otherMgrCtx)).toHaveLength(0);
  });
});
