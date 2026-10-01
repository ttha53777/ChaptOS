/**
 * getMemberProfile — the member card's one extra read (email + join date).
 *
 * Email is deliberately absent from the roster read every page loads, so this is
 * the path that exposes it. The guards: it is org-scoped (a member of another
 * chapter 404s rather than leaking their address), and the join date is this
 * org's Membership, not the account's first chapter.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, joinOrg } from "../setup/factories";
import { db } from "@/lib/db";
import { getMemberProfile } from "@/lib/services/brother-service";
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
    permissions:     0,
    maxRank:         0,
    isOrgAdmin:      false,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

describe("getMemberProfile", () => {
  it("returns a fellow member's email and join date", async () => {
    const org = await createOrg("Beta", "beta-profile");
    const viewer = await createBrother({ orgId: org.id });
    const target = await createBrother({ orgId: org.id, name: "Marcus Bell" });
    await testPrisma.brother.update({ where: { id: target.id }, data: { email: "mbell@state.edu" } });

    const profile = await getMemberProfile(ctxFor(org.id, viewer.id), target.id);
    expect(profile.brotherId).toBe(target.id);
    expect(profile.email).toBe("mbell@state.edu");
    expect(Number.isNaN(Date.parse(profile.joinedAt))).toBe(false);
  });

  it("404s for a member of another org instead of leaking their email", async () => {
    const mine = await createOrg("Mine", "mine-profile");
    const theirs = await createOrg("Theirs", "theirs-profile");
    const viewer = await createBrother({ orgId: mine.id });
    const stranger = await createBrother({ orgId: theirs.id });
    await testPrisma.brother.update({ where: { id: stranger.id }, data: { email: "secret@other.edu" } });

    await expect(getMemberProfile(ctxFor(mine.id, viewer.id), stranger.id)).rejects.toThrow(/not found/i);
  });

  it("uses this org's join date for a multi-org member", async () => {
    const first = await createOrg("First", "first-profile");
    const second = await createOrg("Second", "second-profile");
    const person = await createBrother({ orgId: first.id });
    const viewer = await createBrother({ orgId: second.id });
    await testPrisma.membership.updateMany({
      where: { brotherId: person.id, organizationId: first.id },
      data:  { joinedAt: new Date("2024-01-15T00:00:00Z") },
    });
    await joinOrg({ brotherId: person.id, orgId: second.id });
    await testPrisma.membership.updateMany({
      where: { brotherId: person.id, organizationId: second.id },
      data:  { joinedAt: new Date("2026-09-01T00:00:00Z") },
    });

    const profile = await getMemberProfile(ctxFor(second.id, viewer.id), person.id);
    expect(profile.joinedAt).toBe("2026-09-01T00:00:00.000Z");
  });
});
