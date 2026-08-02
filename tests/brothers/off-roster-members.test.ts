/**
 * Accounts that can read an org but never appear on its roster.
 *
 * `listVisibleBrothers` filters on `isGhost: false` and scopes by
 * `Brother.organizationId`, so two disjoint groups of people hold real access to
 * an org while being invisible on the one page an admin would look at:
 *
 *   "hidden" — legacy `isGhost` rows. Full member-level read (GPA, dues), filtered
 *              out of every listing, count, attendance roll and billing seat. The
 *              claim-flow backdoor that minted these is gone, but removing the mint
 *              path does not revoke access already granted — rows created before
 *              its removal still work. Surfacing them is what makes the removal
 *              complete, so this is the regression guard for that: if the `isGhost`
 *              arm is ever dropped from the query, a hidden reader becomes
 *              undetectable again.
 *   "invite"  — someone whose home org is elsewhere who redeemed an invite here.
 *              Real access, no roster row (Phase 1 scopes rosters by
 *              Brother.organizationId — see AGENTS.md).
 *
 * The `reason` discriminator matters because the two need different words in the
 * UI: one is a disclosure, the other is a known Phase-1 gap.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import { listOffRosterMembers, listVisibleBrothers } from "@/lib/services/brother-service";
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

/** Someone whose Brother row lives in `homeOrgId` but who holds a Membership in `guestOrgId`. */
async function createCrossOrgMember(homeOrgId: number, guestOrgId: number, name: string) {
  const brother = await createBrother({ orgId: homeOrgId, name });
  await testPrisma.membership.create({
    data: { brotherId: brother.id, organizationId: guestOrgId, isOrgAdmin: false },
  });
  return brother;
}

describe("listOffRosterMembers: hidden ghost accounts", () => {
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
    const offRoster = await listOffRosterMembers(ctx);
    expect(offRoster).toHaveLength(1);
    expect(offRoster[0]).toMatchObject({
      brotherId: ghost.id,
      name:      "Silent Observer",
      reason:    "hidden",
    });
  });

  it("does not report ordinary roster members", async () => {
    const org = await createOrg("Quiet Org", "quiet-org");
    const admin = await createBrother({ orgId: org.id, isAdmin: true, isOrgAdmin: true });
    await createBrother({ orgId: org.id, name: "Normal Member" });

    expect(await listOffRosterMembers(ctxFor(org.id, admin.id))).toEqual([]);
  });

  it("does not leak a ghost belonging to another org", async () => {
    const orgA = await createOrg("Org A", "off-roster-a");
    const orgB = await createOrg("Org B", "off-roster-b");
    const admin = await createBrother({ orgId: orgA.id, isAdmin: true, isOrgAdmin: true });
    await createBrother({ orgId: orgB.id, name: "B's Ghost", isGhost: true });

    expect(await listOffRosterMembers(ctxFor(orgA.id, admin.id))).toEqual([]);
  });
});

describe("listOffRosterMembers: cross-org invite redeemers", () => {
  it("reports a member whose home org is elsewhere, tagged 'invite'", async () => {
    const orgA = await createOrg("Host Org", "host-org");
    const orgB = await createOrg("Home Org", "home-org");
    const admin = await createBrother({ orgId: orgA.id, isAdmin: true, isOrgAdmin: true });
    const guest = await createCrossOrgMember(orgB.id, orgA.id, "Visiting Member");

    const offRoster = await listOffRosterMembers(ctxFor(orgA.id, admin.id));
    expect(offRoster).toHaveLength(1);
    expect(offRoster[0]).toMatchObject({ brotherId: guest.id, reason: "invite" });
  });

  it("separates the two reasons when both are present", async () => {
    const orgA = await createOrg("Mixed Org", "mixed-org");
    const orgB = await createOrg("Elsewhere", "elsewhere-org");
    const admin = await createBrother({ orgId: orgA.id, isAdmin: true, isOrgAdmin: true });
    const ghost = await createBrother({ orgId: orgA.id, name: "Hidden One", isGhost: true });
    const guest = await createCrossOrgMember(orgB.id, orgA.id, "Guest One");

    const offRoster = await listOffRosterMembers(ctxFor(orgA.id, admin.id));
    const byId = new Map(offRoster.map(m => [m.brotherId, m.reason]));

    expect(offRoster).toHaveLength(2);
    expect(byId.get(ghost.id)).toBe("hidden");
    expect(byId.get(guest.id)).toBe("invite");
  });
});
