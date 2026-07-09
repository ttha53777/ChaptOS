/**
 * Tests for provisionOrg() — the org-creation service.
 *
 * We test the service directly rather than POST /api/orgs because POST adds
 * Supabase session validation that's awkward to stub. The service is what
 * actually mutates the DB; mocking the route adds no coverage.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { provisionOrg } from "@/lib/services/org-service";
import { ConflictError, ValidationError } from "@/lib/errors";
import { getOrgType } from "@/lib/org-types";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

const VALID = {
  name:        "Test Org",
  slug:        "test-org",
  orgType:     "fraternity" as const,
  founderName: "Jordan Lee",
};

describe("provisionOrg: happy path", () => {
  it("creates Organization + Config + Brother + Membership + roles atomically", async () => {
    const out = await provisionOrg(VALID, "auth-user-1", "jordan@example.com");
    expect(out.organizationId).toBeGreaterThan(0);
    expect(out.slug).toBe("test-org");
    expect(out.brotherId).toBeGreaterThan(0);

    const org = await testPrisma.organization.findUnique({
      where: { id: out.organizationId },
      include: { config: true, brothers: true, roles: true, memberships: true },
    });
    expect(org).not.toBeNull();
    expect(org!.orgType).toBe("fraternity");
    expect(org!.createdByBrotherId).toBe(out.brotherId);
    expect(org!.config).not.toBeNull();
    expect(org!.config!.enabledWorkflows.length).toBeGreaterThan(0);
    expect(org!.brothers).toHaveLength(1);
    expect(org!.brothers[0]!.name).toBe("Jordan Lee");
    expect(org!.brothers[0]!.authUserId).toBe("auth-user-1");
    expect(org!.brothers[0]!.email).toBe("jordan@example.com");
    expect(org!.memberships).toHaveLength(1);
    expect(org!.memberships[0]!.isOrgAdmin).toBe(true);
    expect(org!.roles.length).toBe(getOrgType("fraternity")!.roleSeeds.length);
  });

  it("grants the founder the founder role (rank 100, ALL_PERMISSIONS)", async () => {
    const out = await provisionOrg(VALID, "auth-user-2", null);
    const founderRoles = await testPrisma.brotherRole.findMany({
      where: { brotherId: out.brotherId },
      include: { role: true },
    });
    expect(founderRoles).toHaveLength(1);
    expect(founderRoles[0]!.role.rank).toBe(100);
    expect(founderRoles[0]!.role.permissions).toBe(ALL_PERMISSIONS);
    expect(founderRoles[0]!.organizationId).toBe(out.organizationId);
  });

  it("seeds OrganizationConfig with the template's enabled workflows + vocab", async () => {
    const out = await provisionOrg(VALID, "auth-user-3", null);
    const cfg = await testPrisma.organizationConfig.findUnique({
      where: { organizationId: out.organizationId },
    });
    const template = getOrgType("fraternity")!;
    expect(new Set(cfg!.enabledWorkflows)).toEqual(new Set(template.enabledWorkflows));
    expect(cfg!.vocabularyOverrides).toEqual(template.vocabularyOverrides);
  });

  it("writes an org.created OperationalEvent inside the transaction", async () => {
    const out = await provisionOrg(VALID, "auth-user-4", null);
    const events = await testPrisma.operationalEvent.findMany({
      where: { organizationId: out.organizationId, action: "org.created" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.subjectType).toBe("Organization");
    expect(events[0]!.subjectId).toBe(out.organizationId);
    expect(events[0]!.actorId).toBe(out.brotherId);
  });

  it("provisions different role sets per org type", async () => {
    const fraternityOut = await provisionOrg(
      { ...VALID, slug: "frat", orgType: "fraternity" },
      "u-frat",
      null,
    );
    const genericOut = await provisionOrg(
      { ...VALID, slug: "gen", orgType: "generic-org" },
      "u-gen",
      null,
    );
    const fratRoles = await testPrisma.role.findMany({ where: { organizationId: fraternityOut.organizationId } });
    const genRoles  = await testPrisma.role.findMany({ where: { organizationId: genericOut.organizationId } });
    expect(fratRoles.length).toBe(getOrgType("fraternity")!.roleSeeds.length);
    expect(genRoles.length).toBe(getOrgType("generic-org")!.roleSeeds.length);
    expect(fratRoles.length).toBeGreaterThan(genRoles.length);
  });
});

describe("provisionOrg: rejection paths", () => {
  it("rejects a reserved slug as a ValidationError", async () => {
    await expect(
      provisionOrg({ ...VALID, slug: "admin" }, "u-a", null),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a bad-format slug as a ValidationError", async () => {
    await expect(
      provisionOrg({ ...VALID, slug: "Bad Slug" }, "u-b", null),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unknown org type as a ValidationError", async () => {
    await expect(
      provisionOrg({ ...VALID, orgType: "not-a-thing" }, "u-c", null),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a duplicate slug as a ConflictError", async () => {
    await provisionOrg(VALID, "u-d-1", null);
    await expect(
      provisionOrg(VALID, "u-d-2", null),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("lets an already-linked user found an ADDITIONAL org, reusing their Brother", async () => {
    // A Google account maps to one Brother globally; founding a second org
    // reuses that Brother + adds a new admin Membership (it does NOT create a
    // second Brother, which would collide on the unique authUserId).
    const first  = await provisionOrg({ ...VALID, slug: "first", founderName: "Jordan Lee" }, "u-e", "jordan@example.com");
    const second = await provisionOrg({ ...VALID, slug: "second", founderName: "Ignored Name" }, "u-e", "jordan@example.com");

    // Same Brother across both orgs.
    expect(second.brotherId).toBe(first.brotherId);

    // Exactly one Brother row exists for this account.
    const brothers = await testPrisma.brother.findMany({ where: { authUserId: "u-e" } });
    expect(brothers).toHaveLength(1);
    // Their home org stays the first; founderName from the 2nd create is ignored.
    expect(brothers[0]!.organizationId).toBe(first.organizationId);
    expect(brothers[0]!.name).toBe("Jordan Lee");

    // Two Memberships, both admin; the second is in the new org.
    const memberships = await testPrisma.membership.findMany({
      where: { brotherId: first.brotherId },
      orderBy: { organizationId: "asc" },
    });
    expect(memberships).toHaveLength(2);
    expect(memberships.every(m => m.isOrgAdmin)).toBe(true);
    const secondMembership = memberships.find(m => m.organizationId === second.organizationId);
    expect(secondMembership).toBeDefined();

    // Founder BrotherRole was seeded in the NEW org too.
    const rolesInSecond = await testPrisma.brotherRole.findMany({
      where: { brotherId: first.brotherId, organizationId: second.organizationId },
    });
    expect(rolesInSecond.length).toBeGreaterThan(0);

    // The new org records the reused Brother as its creator.
    const org2 = await testPrisma.organization.findUnique({ where: { id: second.organizationId } });
    expect(org2!.createdByBrotherId).toBe(first.brotherId);
  });

  it("rejects duplicate slug with a slug-specific message (not account-linked)", async () => {
    await provisionOrg(VALID, "u-slug-1", null);
    const err = await provisionOrg(VALID, "u-slug-2", null).catch(e => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toMatch(/slug/i);
  });

  it("leaves no orphans when provisioning fails inside the transaction", async () => {
    // Seed an existing org with the slug to force a P2002 mid-transaction.
    await testPrisma.organization.create({ data: { name: "Taken", slug: "test-org" } });
    await expect(
      provisionOrg(VALID, "u-orphan", null),
    ).rejects.toBeInstanceOf(ConflictError);

    // The failing transaction must not have created a Brother for u-orphan.
    const orphanBrother = await testPrisma.brother.findUnique({ where: { authUserId: "u-orphan" } });
    expect(orphanBrother).toBeNull();
  });
});

describe("provisionOrg: trim + sanitization", () => {
  it("trims org name, slug, founder name (via Zod schema upstream)", async () => {
    // provisionOrg expects already-parsed Zod output; the route calls
    // createOrgInput.parse() first. We pass already-trimmed strings here to
    // match the contract; the create-org route test confirms the parsing.
    const out = await provisionOrg(
      { name: "Test Org", slug: "trimmed", orgType: "fraternity", founderName: "Jordan" },
      "u-trim",
      null,
    );
    const org = await testPrisma.organization.findUnique({
      where: { id: out.organizationId },
      include: { brothers: true },
    });
    expect(org!.name).toBe("Test Org");
    expect(org!.slug).toBe("trimmed");
    expect(org!.brothers[0]!.name).toBe("Jordan");
  });
});

describe("provisionOrg: blueprint (atomic pre-creation setup)", () => {
  it("applies enabledWorkflows from the blueprint (normalized, operations forced on)", async () => {
    const out = await provisionOrg(
      { ...VALID, slug: "bp-wf", blueprint: { enabledWorkflows: ["members", "finance"] } },
      "u-bp-wf",
      null,
    );
    const cfg = await testPrisma.organizationConfig.findUnique({
      where: { organizationId: out.organizationId },
    });
    // Founder chose members+finance; operations is force-unioned even though not sent.
    expect(new Set(cfg!.enabledWorkflows)).toEqual(new Set(["members", "finance", "operations"]));
  });

  it("merges blueprint vocab OVER the template defaults (sparse), dropping unknown keys", async () => {
    const out = await provisionOrg(
      {
        ...VALID,
        slug: "bp-vocab",
        // fraternity template defaults: { Member: "Brother", Meetings: "Chapter" }
        blueprint: { vocabularyOverrides: { Member: "Knight", NotAKey: "ignored" } },
      },
      "u-bp-vocab",
      null,
    );
    const cfg = await testPrisma.organizationConfig.findUnique({
      where: { organizationId: out.organizationId },
    });
    // Member overridden, Meetings inherited from template, unknown key stripped.
    expect(cfg!.vocabularyOverrides).toEqual({ Member: "Knight", Meetings: "Chapter" });
  });

  it("seeds blueprint roleSeeds (non-founder as editable isSystem=false) with correct permission bits", async () => {
    const out = await provisionOrg(
      {
        ...VALID,
        slug: "bp-roles",
        blueprint: {
          roleSeeds: [
            { name: "Founder", rank: 99, all: true },
            { name: "Money Person", rank: 40, permissions: ["MANAGE_TREASURY"] },
            { name: "Poster", rank: 30, permissions: ["MANAGE_ANNOUNCEMENTS", "MANAGE_INSTAGRAM"] },
          ],
        },
      },
      "u-bp-roles",
      "founder@example.com",
    );
    const roles = await testPrisma.role.findMany({
      where: { organizationId: out.organizationId },
      orderBy: { rank: "desc" },
    });
    expect(roles).toHaveLength(3);

    const founder = roles.find(r => r.name === "Founder")!;
    // Founder is forced to rank 100 + full bitfield regardless of the sent rank.
    expect(founder.rank).toBe(100);
    expect(founder.permissions).toBe(ALL_PERMISSIONS);

    const treasurer = roles.find(r => r.name === "Money Person")!;
    expect(treasurer.isSystem).toBe(false); // editable in Settings
    expect(treasurer.permissions).toBe(PERMISSIONS.MANAGE_TREASURY);

    const poster = roles.find(r => r.name === "Poster")!;
    expect(poster.permissions).toBe(PERMISSIONS.MANAGE_ANNOUNCEMENTS | PERMISSIONS.MANAGE_INSTAGRAM);
  });

  it("links the founder to the (possibly renamed) all-perms role, keeping full access", async () => {
    const out = await provisionOrg(
      {
        ...VALID,
        slug: "bp-founder",
        founderName: "Casey",
        blueprint: {
          roleSeeds: [
            { name: "Grand Poobah", rank: 50, all: true },
            { name: "Helper", rank: 20, permissions: ["MANAGE_EVENTS"] },
          ],
        },
      },
      "u-bp-founder",
      null,
    );
    const founderLinks = await testPrisma.brotherRole.findMany({
      where: { brotherId: out.brotherId },
      include: { role: true },
    });
    expect(founderLinks).toHaveLength(1);
    expect(founderLinks[0]!.role.name).toBe("Grand Poobah");
    expect(founderLinks[0]!.role.rank).toBe(100);
    expect(founderLinks[0]!.role.permissions).toBe(ALL_PERMISSIONS);
    // Legacy Brother.role string reflects the renamed founder role.
    const brother = await testPrisma.brother.findUnique({ where: { id: out.brotherId } });
    expect(brother!.role).toBe("Grand Poobah");
  });

  it("synthesizes a founder role when the blueprint roleSeeds omit an all:true seat", async () => {
    const out = await provisionOrg(
      {
        ...VALID,
        slug: "bp-nofounder",
        blueprint: { roleSeeds: [{ name: "Only Officer", rank: 40, permissions: ["MANAGE_DOCS"] }] },
      },
      "u-bp-nofounder",
      null,
    );
    // Founder still gets an all-perms rank-100 role even though none was sent.
    const founderLinks = await testPrisma.brotherRole.findMany({
      where: { brotherId: out.brotherId },
      include: { role: true },
    });
    expect(founderLinks).toHaveLength(1);
    expect(founderLinks[0]!.role.rank).toBe(100);
    expect(founderLinks[0]!.role.permissions).toBe(ALL_PERMISSIONS);
    // Two roles total: the synthesized founder + the one sent seat.
    const roles = await testPrisma.role.findMany({ where: { organizationId: out.organizationId } });
    expect(roles).toHaveLength(2);
  });

  it("stamps onboardingCompletedAt at creation so founders skip the retired wizard", async () => {
    const out = await provisionOrg(
      { ...VALID, slug: "bp-onboarded", blueprint: { enabledWorkflows: ["members"] } },
      "u-bp-onboarded",
      null,
    );
    const cfg = await testPrisma.organizationConfig.findUnique({
      where: { organizationId: out.organizationId },
    });
    expect(cfg!.onboardingCompletedAt).not.toBeNull();
  });

  it("falls back to the template when no blueprint is sent (regression guard)", async () => {
    const out = await provisionOrg({ ...VALID, slug: "no-bp" }, "u-no-bp", null);
    const cfg = await testPrisma.organizationConfig.findUnique({
      where: { organizationId: out.organizationId },
    });
    const template = getOrgType("fraternity")!;
    expect(new Set(cfg!.enabledWorkflows)).toEqual(new Set(template.enabledWorkflows));
    expect(cfg!.vocabularyOverrides).toEqual(template.vocabularyOverrides);
    // Template roles stay isSystem=true (protected in Settings).
    const roles = await testPrisma.role.findMany({ where: { organizationId: out.organizationId } });
    expect(roles).toHaveLength(template.roleSeeds.length);
    expect(roles.every(r => r.isSystem)).toBe(true);
  });
});

describe("provisionOrg → org discoverable by Join lookup", () => {
  it("an org provisioned here is immediately findable by slug", async () => {
    // Ensures the org-create → org-lookup loop is complete end-to-end.
    // A regression where slug case or whitespace differed between the two
    // paths would show up here first.
    const out = await provisionOrg(
      { name: "Lookup Test", slug: "lookup-test", orgType: "generic-org", founderName: "Alex" },
      "u-discoverable",
      null,
    );
    const found = await testPrisma.organization.findUnique({
      where: { slug: "lookup-test" },
      select: { id: true, name: true },
    });
    expect(found?.id).toBe(out.organizationId);
    expect(found?.name).toBe("Lookup Test");
  });
});
