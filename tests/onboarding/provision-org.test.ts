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
import { DEFAULT_EVENT_TYPE_SEEDS, getOrgType } from "@/lib/org-types";
import { BUILTIN_EVENT_TYPES, isEventTypeVisibleInPicker } from "@/lib/event-types";
import { isProgrammingManagedType } from "@/lib/programming";
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

describe("provisionOrg: starter event types", () => {
  it("seeds the built-ins plus the org type's editable starter categories", async () => {
    const out = await provisionOrg(VALID, "u-evt-frat", null);
    const template = getOrgType("fraternity")!;

    const types = await testPrisma.calendarEventType.findMany({
      where: { organizationId: out.organizationId },
      orderBy: { displayOrder: "asc" },
    });

    // Built-ins seeded as before.
    const builtins = types.filter(t => t.builtin);
    expect(builtins.map(t => t.slug)).toEqual(BUILTIN_EVENT_TYPES.map(t => t.slug));

    // Starter customs match the template, and are editable/deletable
    // (builtin:false, creatable:true) and gated by the events workflow.
    const customs = types.filter(t => !t.builtin);
    expect(customs.map(t => t.slug)).toEqual(template.eventTypeSeeds!.map(s => s.slug));
    for (const c of customs) {
      expect(c.builtin).toBe(false);
      expect(c.creatable).toBe(true);
      expect(c.hidden).toBe(false);
      expect(c.workflowId).toBe("events");
    }

    // displayOrder continues past the built-ins, in template order.
    expect(customs.map(t => t.displayOrder)).toEqual(
      template.eventTypeSeeds!.map((_, i) => BUILTIN_EVENT_TYPES.length + i),
    );
  });

  it("makes the starter categories show as managed Programming categories (events on)", async () => {
    const out = await provisionOrg(VALID, "u-evt-managed", null);
    const template = getOrgType("fraternity")!;
    const types = await testPrisma.calendarEventType.findMany({
      where: { organizationId: out.organizationId },
    });
    const managed = types.filter(
      t => isProgrammingManagedType(t) && isEventTypeVisibleInPicker(t, ["events"]),
    );
    for (const s of template.eventTypeSeeds!) {
      expect(
        managed.some(m => m.slug === s.slug),
        `${s.slug} should be a managed programming category`,
      ).toBe(true);
    }
  });

  it("tailors the starter set to the org type", async () => {
    const out = await provisionOrg(
      { ...VALID, slug: "sports", orgType: "sports-team" },
      "u-evt-sports",
      null,
    );
    const customs = await testPrisma.calendarEventType.findMany({
      where: { organizationId: out.organizationId, builtin: false },
      orderBy: { displayOrder: "asc" },
    });
    expect(customs.map(t => t.slug)).toEqual(["game", "practice", "tournament"]);
  });

  it("falls back to DEFAULT_EVENT_TYPE_SEEDS for a template without its own set", async () => {
    // generic-org declares no eventTypeSeeds → the shared default is used.
    expect(getOrgType("generic-org")!.eventTypeSeeds).toBeUndefined();
    const out = await provisionOrg(
      { ...VALID, slug: "gen-evt", orgType: "generic-org" },
      "u-evt-gen",
      null,
    );
    const customs = await testPrisma.calendarEventType.findMany({
      where: { organizationId: out.organizationId, builtin: false },
      orderBy: { displayOrder: "asc" },
    });
    expect(customs.map(t => t.slug)).toEqual(DEFAULT_EVENT_TYPE_SEEDS.map(s => s.slug));
  });
});

describe("provisionOrg: event types from the blueprint", () => {
  /** Every CalendarEventType row for an org, in creation order. */
  async function typesFor(organizationId: number) {
    return testPrisma.calendarEventType.findMany({
      where: { organizationId },
      orderBy: { displayOrder: "asc" },
    });
  }

  it("applies the founder's built-in renames and recolors", async () => {
    const out = await provisionOrg(
      {
        ...VALID,
        blueprint: {
          eventTypes: {
            builtins: [
              { slug: "chapter", label: "General Body", color: "#6d28d9", colorDark: "#a78bfa" },
            ],
          },
        },
      },
      "u-evt-rename",
      null,
    );
    const types = await typesFor(out.organizationId);
    const chapter = types.find(t => t.slug === "chapter")!;
    expect(chapter.label).toBe("General Body");
    expect(chapter.color).toBe("#6d28d9");
    expect(chapter.colorDark).toBe("#a78bfa");

    // Built-ins the blueprint didn't mention keep their registry values.
    const party = types.find(t => t.slug === "party")!;
    const registryParty = BUILTIN_EVENT_TYPES.find(t => t.slug === "party")!;
    expect(party.label).toBe(registryParty.label);
    expect(party.color).toBe(registryParty.color);
  });

  it("never takes behavior fields for a built-in from the payload", async () => {
    // The trust boundary: a founder owns how a type LOOKS, provisioning owns how
    // it BEHAVES. Renaming `party` must not make it creatable from the timeline,
    // and nothing may un-gate `deadline`.
    const out = await provisionOrg(
      {
        ...VALID,
        blueprint: {
          eventTypes: {
            builtins: [
              { slug: "party",    label: "Mixer",   color: "#9a7224", colorDark: "#ddb36a" },
              { slug: "deadline", label: "Due",     color: "#9a7224", colorDark: "#ddb36a" },
              { slug: "chapter",  label: "Meeting", color: "#9a7224", colorDark: "#ddb36a" },
            ],
          },
        },
      },
      "u-evt-behavior",
      null,
    );
    const types = await typesFor(out.organizationId);
    for (const registry of BUILTIN_EVENT_TYPES) {
      const row = types.find(t => t.slug === registry.slug)!;
      expect(row.builtin, registry.slug).toBe(true);
      expect(row.creatable, registry.slug).toBe(registry.creatable);
      expect(row.mandatoryDefault, registry.slug).toBe(registry.mandatoryDefault);
      expect(row.workflowId, registry.slug).toBe(registry.workflowId);
      expect(row.hidden, registry.slug).toBe(false);
    }
  });

  it("an explicit custom list replaces the org type's starters", async () => {
    const out = await provisionOrg(
      {
        ...VALID,
        blueprint: {
          eventTypes: {
            customs: [
              { slug: "social",    label: "Social",    color: "#9a7224", colorDark: "#ddb36a", workflowId: "events" },
              { slug: "rush-week", label: "Rush Week", color: "#3f6ea3", colorDark: "#8fb0d6", workflowId: null },
            ],
          },
        },
      },
      "u-evt-customs",
      null,
    );
    const customs = (await typesFor(out.organizationId)).filter(t => !t.builtin);
    // Fundraiser + Programming were dropped by the founder; they aren't seeded.
    expect(customs.map(t => t.slug)).toEqual(["social", "rush-week"]);
    for (const c of customs) {
      expect(c.builtin).toBe(false);
      expect(c.creatable).toBe(true);
      expect(c.hidden).toBe(false);
      expect(c.mandatoryDefault).toBe(false);
    }
    // A starter keeps its Events gating; a hand-added type is ungated so it can
    // never silently vanish behind a page toggle.
    expect(customs.find(t => t.slug === "social")!.workflowId).toBe("events");
    expect(customs.find(t => t.slug === "rush-week")!.workflowId).toBeNull();

    // displayOrder stays contiguous across built-ins then customs.
    const all = await typesFor(out.organizationId);
    expect(all.map(t => t.displayOrder)).toEqual(all.map((_, i) => i));
  });

  it("an empty custom list seeds no customs at all", async () => {
    const out = await provisionOrg(
      { ...VALID, blueprint: { eventTypes: { customs: [] } } },
      "u-evt-empty",
      null,
    );
    const types = await typesFor(out.organizationId);
    expect(types.filter(t => !t.builtin)).toEqual([]);
    expect(types.map(t => t.slug)).toEqual(BUILTIN_EVENT_TYPES.map(t => t.slug));
  });

  it("an absent eventTypes block still seeds the org type's starters", async () => {
    // The regression guard for every non-flow caller (the bare 4-field create,
    // the recovery path): omitting the block must behave exactly as before.
    const out = await provisionOrg(
      { ...VALID, blueprint: { enabledWorkflows: ["members", "events"] } },
      "u-evt-absent",
      null,
    );
    const customs = (await typesFor(out.organizationId)).filter(t => !t.builtin);
    expect(customs.map(t => t.slug)).toEqual(
      getOrgType("fraternity")!.eventTypeSeeds!.map(s => s.slug),
    );
  });

  it("drops a custom whose slug shadows a built-in", async () => {
    // Defense in depth behind the schema — a duplicate slug would violate the
    // (organizationId, slug) unique index and fail the whole transaction.
    const out = await provisionOrg(
      {
        ...VALID,
        blueprint: {
          eventTypes: {
            customs: [
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { slug: "chapter", label: "Shadow", color: "#9a7224", colorDark: "#ddb36a" } as any,
              { slug: "social", label: "Social", color: "#9a7224", colorDark: "#ddb36a" },
            ],
          },
        },
      },
      "u-evt-shadow",
      null,
    );
    const types = await typesFor(out.organizationId);
    expect(types.filter(t => t.slug === "chapter")).toHaveLength(1);
    expect(types.find(t => t.slug === "chapter")!.builtin).toBe(true);
    expect(types.filter(t => !t.builtin).map(t => t.slug)).toEqual(["social"]);
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

describe("provisionOrg: blueprint.term → first active Semester", () => {
  const TERM = { label: "Fall 2026", startDate: "2026-08-24", endDate: "2026-12-18" };

  it("creates the confirmed term as the org's active semester", async () => {
    const out = await provisionOrg(
      { ...VALID, slug: "with-term", blueprint: { term: TERM } },
      "u-term",
      null,
    );
    const semesters = await testPrisma.semester.findMany({
      where: { organizationId: out.organizationId },
    });
    expect(semesters).toHaveLength(1);
    expect(semesters[0]!).toMatchObject({ ...TERM, isActive: true });
  });

  it("creates no semester when the blueprint has no term (skip path regression)", async () => {
    const out = await provisionOrg({ ...VALID, slug: "no-term" }, "u-no-term", null);
    const count = await testPrisma.semester.count({ where: { organizationId: out.organizationId } });
    expect(count).toBe(0);
  });
});

describe("provisionOrg: blueprint.metrics", () => {
  const BUILTINS_ALL = { attendance: true, gpa: true, duesOwed: true, serviceHours: true };

  it("seeds custom OrgMetricDefinition rows with generated slugs and stable order", async () => {
    const out = await provisionOrg(
      {
        ...VALID,
        slug: "with-metrics",
        blueprint: {
          metrics: {
            builtins: BUILTINS_ALL,
            custom: [
              { name: "Chapter Points", unit: "pts" },
              { name: "Chapter Points", unit: null }, // duplicate name → de-duped slug
              { name: "Books Read" },
            ],
          },
        },
      },
      "u-metrics",
      null,
    );
    const defs = await testPrisma.orgMetricDefinition.findMany({
      where: { organizationId: out.organizationId },
      orderBy: { displayOrder: "asc" },
    });
    expect(defs.map(d => d.slug)).toEqual(["chapter-points", "chapter-points-2", "books-read"]);
    expect(defs.map(d => d.name)).toEqual(["Chapter Points", "Chapter Points", "Books Read"]);
    expect(defs[0]!.unit).toBe("pts");
    expect(defs[2]!.unit).toBeNull();
    expect(defs.map(d => d.displayOrder)).toEqual([0, 1, 2]);
    // Threshold invariant the Settings validator enforces: atRiskBelow <= goal.
    for (const d of defs) expect(d.atRiskBelow).toBeLessThanOrEqual(d.goal);
  });

  it("hides the KPI widgets for un-tracked builtins via disabledFeatures", async () => {
    const out = await provisionOrg(
      {
        ...VALID,
        slug: "hidden-kpis",
        blueprint: {
          metrics: {
            builtins: { attendance: true, gpa: false, duesOwed: true, serviceHours: false },
            custom: [],
          },
        },
      },
      "u-kpis",
      null,
    );
    const cfg = await testPrisma.organizationConfig.findUnique({
      where: { organizationId: out.organizationId },
    });
    expect(cfg!.disabledFeatures).toEqual({ operations: ["kpi-gpa", "kpi-service"] });
  });

  it("leaves disabledFeatures empty and seeds nothing when metrics are absent (regression)", async () => {
    const out = await provisionOrg({ ...VALID, slug: "no-metrics" }, "u-no-metrics", null);
    const cfg = await testPrisma.organizationConfig.findUnique({
      where: { organizationId: out.organizationId },
    });
    expect(cfg!.disabledFeatures).toEqual({});
    const count = await testPrisma.orgMetricDefinition.count({
      where: { organizationId: out.organizationId },
    });
    expect(count).toBe(0);
  });
});

/**
 * Per-org founder name. The /create interview asks the founder their name, and
 * that answer is this org's name for them — it lands on the new Membership, not
 * (necessarily) on the account-level Brother row.
 *
 * The case that used to be broken: an existing user founding a SECOND org had
 * their interview answer thrown away and inherited whatever their first org
 * called them.
 */
describe("provisionOrg: founder name is per-org", () => {
  it("writes founderName to the new org's Membership", async () => {
    const out = await provisionOrg(VALID, "auth-user-1", "jordan@example.com");

    const membership = await testPrisma.membership.findFirst({
      where:  { brotherId: out.brotherId, organizationId: out.organizationId },
      select: { name: true },
    });
    expect(membership?.name).toBe("Jordan Lee");
  });

  it("a second org honors the new interview answer without touching the first", async () => {
    const first = await provisionOrg(VALID, "auth-user-1", "jordan@example.com");

    // Same Google account (same authUserId) founds another org, giving a
    // different name this time.
    const second = await provisionOrg(
      { ...VALID, name: "Second Org", slug: "second-org", founderName: "Jordy" },
      "auth-user-1",
      "jordan@example.com",
    );

    // One identity: the Brother row is reused, not duplicated.
    expect(second.brotherId).toBe(first.brotherId);

    const m2 = await testPrisma.membership.findFirst({
      where:  { brotherId: second.brotherId, organizationId: second.organizationId },
      select: { name: true },
    });
    expect(m2?.name).toBe("Jordy");

    // The first org still calls them what it always did.
    const m1 = await testPrisma.membership.findFirst({
      where:  { brotherId: first.brotherId, organizationId: first.organizationId },
      select: { name: true },
    });
    expect(m1?.name).toBe("Jordan Lee");

    // And the account-level name is untouched by the second org's interview.
    const brother = await testPrisma.brother.findUnique({
      where:  { id: first.brotherId },
      select: { name: true },
    });
    expect(brother?.name).toBe("Jordan Lee");
  });
});
