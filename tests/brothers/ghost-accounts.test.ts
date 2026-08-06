/**
 * Accounts that can read an org but never appear on its roster.
 *
 * After Phase 2 there is exactly one such group left: legacy `isGhost` rows.
 * Full member-level read (GPA, dues), filtered out of every listing, count,
 * attendance roll and billing seat. The claim-flow backdoor that minted these is
 * gone, but removing the mint path does not revoke access already granted — rows
 * created before its removal still work. Surfacing them is what makes the
 * removal complete, so this file is the regression guard: if the `isGhost` arm is
 * ever dropped, a hidden reader becomes undetectable again.
 *
 * There used to be a second group — people whose account had originated in
 * another org, who redeemed an invite here and got access with no roster row,
 * because the roster scoped by `Brother.organizationId`. That group is gone: the
 * roster reads from Membership, so joining an org puts you on its roster. The
 * last describe block below is what pins that down.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, joinOrg } from "../setup/factories";
import { db } from "@/lib/db";
import { listGhostAccounts, listVisibleBrothers } from "@/lib/services/brother-service";
import { PERMISSIONS } from "@/lib/permissions";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     PERMISSIONS.MANAGE_BROTHERS,
    maxRank:         0,
    isOrgAdmin:      true,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

describe("listGhostAccounts", () => {
  it("reports a legacy isGhost account that the roster cannot show", async () => {
    const org = await createOrg("Ghost Org", "ghost-org");
    const admin = await createBrother({ orgId: org.id, isAdmin: true, isOrgAdmin: true });
    const ghost = await createBrother({
      orgId:   org.id,
      name:    "Silent Observer",
      isGhost: true,
    });

    const ctx = ctxFor(org.id, admin.id);

    // Still absent from the roster — the flag's behaviour is unchanged...
    const roster = await listVisibleBrothers(ctx);
    expect(roster.map(b => b.id)).not.toContain(ghost.id);

    // ...but no longer undetectable.
    const ghosts = await listGhostAccounts(ctx);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toMatchObject({ brotherId: ghost.id, name: "Silent Observer" });
  });

  it("does not report ordinary roster members", async () => {
    const org = await createOrg("Quiet Org", "quiet-org");
    const admin = await createBrother({ orgId: org.id, isAdmin: true, isOrgAdmin: true });
    await createBrother({ orgId: org.id, name: "Normal Member" });

    expect(await listGhostAccounts(ctxFor(org.id, admin.id))).toEqual([]);
  });

  it("does not leak a ghost belonging to another org", async () => {
    const orgA = await createOrg("Org A", "ghost-a");
    const orgB = await createOrg("Org B", "ghost-b");
    const admin = await createBrother({ orgId: orgA.id, isAdmin: true, isOrgAdmin: true });
    await createBrother({ orgId: orgB.id, name: "B's Ghost", isGhost: true });

    expect(await listGhostAccounts(ctxFor(orgA.id, admin.id))).toEqual([]);
  });
});

describe("a member of two orgs is on BOTH rosters", () => {
  it("appears on the roster of an org their account did not originate in", async () => {
    // The exact case that used to be invisible: their Brother row's
    // organizationId is orgB, and they hold a Membership in orgA.
    const orgA = await createOrg("Host Org", "host-org");
    const orgB = await createOrg("Origin Org", "origin-org");
    const admin = await createBrother({ orgId: orgA.id, isAdmin: true, isOrgAdmin: true });
    const guest = await createBrother({ orgId: orgB.id, name: "Visiting Member" });
    await joinOrg({ brotherId: guest.id, orgId: orgA.id, membershipName: "Visiting Member" });

    const roster = await listVisibleBrothers(ctxFor(orgA.id, admin.id));
    expect(roster.map(b => b.id)).toContain(guest.id);

    // And they are not reported as a ghost — they are an ordinary member here.
    expect(await listGhostAccounts(ctxFor(orgA.id, admin.id))).toEqual([]);
  });

  it("carries independent numbers in each org", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isAdmin: true, isOrgAdmin: true });
    const adminB = await createBrother({ orgId: orgB.id, isAdmin: true, isOrgAdmin: true });

    // One person, two roster spots, two sets of numbers — and two names.
    const person = await createBrother({
      orgId: orgA.id, name: "Robert Chen", membershipName: "Rob",
      role: "Treasurer", gpa: 3.9, duesOwed: 120, serviceHours: 8,
    });
    await joinOrg({
      brotherId: person.id, orgId: orgB.id, membershipName: "Robert Chen",
      role: "Member", gpa: 3.1, duesOwed: 0, serviceHours: 40,
    });

    const inA = (await listVisibleBrothers(ctxFor(orgA.id, adminA.id))).find(b => b.id === person.id);
    const inB = (await listVisibleBrothers(ctxFor(orgB.id, adminB.id))).find(b => b.id === person.id);

    expect(inA).toMatchObject({ name: "Rob", role: "Treasurer", gpa: 3.9, duesOwed: 120, serviceHours: 8 });
    expect(inB).toMatchObject({ name: "Robert Chen", role: "Member", gpa: 3.1, duesOwed: 0, serviceHours: 40 });
  });
});
