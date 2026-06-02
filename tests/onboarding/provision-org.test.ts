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
import { AlreadyLinkedError, ConflictError, ValidationError } from "@/lib/errors";
import { getOrgType } from "@/lib/org-types";
import { ALL_PERMISSIONS } from "@/lib/permissions";

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

  it("rejects when the auth user already has a Brother somewhere", async () => {
    await provisionOrg({ ...VALID, slug: "first" }, "u-e", null);
    const err = await provisionOrg({ ...VALID, slug: "second" }, "u-e", null).catch(e => e);
    // Specifically AlreadyLinkedError (not a bare ConflictError): the /api/orgs
    // route catches this subclass to recover a founder whose prior POST committed
    // but lost its response, routing them into the org they already created.
    expect(err).toBeInstanceOf(AlreadyLinkedError);
    // The user-facing message must mention the account link, not the slug —
    // otherwise the founder thinks they need to try a different slug, which
    // wouldn't help.
    expect(err.message).toMatch(/account/i);
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
