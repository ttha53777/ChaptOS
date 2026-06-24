/**
 * Tests for setWorkflows() — the org-config service behind the post-creation
 * page picker (and any future Settings surface that toggles enabled workflows).
 *
 * We exercise the service directly against the test DB rather than the PATCH
 * route: the route adds only buildContext() session resolution on top, which is
 * covered elsewhere. The service is what normalizes the set, enforces the
 * always-on workflows, gates on admin, and writes the row.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import { setWorkflows, setThresholds, setDisabledFeatures, completeOnboarding } from "@/lib/services/org-config-service";
import { ForbiddenError } from "@/lib/errors";
import { ALWAYS_ON_WORKFLOWS } from "@/lib/org-types";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/thresholds";
import type { RequestContext } from "@/lib/context";

const SAMPLE_THRESHOLDS: Thresholds = {
  attendanceAtRisk: 50,
  attendanceWatch:  70,
  gpaAtRisk:        2.0,
  gpaWatch:         2.5,
  serviceHoursGoal: 25,
};

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

/**
 * Minimal RequestContext for the service. setWorkflows reads isOrgAdmin /
 * isPlatformAdmin / db / orgId, and emit() reads requestId / actorId. Everything
 * else is filler the service never touches.
 */
function ctxFor(orgId: number, actorId: number, opts: { isOrgAdmin?: boolean; isPlatformAdmin?: boolean } = {}): RequestContext {
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
    isOrgAdmin:      opts.isOrgAdmin ?? false,
    isPlatformAdmin: opts.isPlatformAdmin ?? false,
    db:              db(orgId),
  };
}

async function seedAdminOrg() {
  const org = await createOrg("Config Org", "config-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  // Provision the config row the way org creation would.
  await testPrisma.organizationConfig.create({
    data: { organizationId: org.id, enabledWorkflows: ["members", "events", "operations"] },
  });
  return { org, admin };
}

describe("setWorkflows: happy path", () => {
  it("replaces the enabled set with the chosen optional workflows", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    const out = await setWorkflows(ctx, { enabledWorkflows: ["finance", "docs"] });

    expect(out.enabledWorkflows).toContain("finance");
    expect(out.enabledWorkflows).toContain("docs");
    // Replaced, not merged: a previously-enabled workflow not in the new set is gone.
    expect(out.enabledWorkflows).not.toContain("members");

    const row = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(new Set(row?.enabledWorkflows)).toEqual(new Set(out.enabledWorkflows));
  });

  it("always force-enables the always-on workflows even when omitted", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    const out = await setWorkflows(ctx, { enabledWorkflows: [] });

    for (const w of ALWAYS_ON_WORKFLOWS) {
      expect(out.enabledWorkflows).toContain(w);
    }
  });

  it("de-duplicates and returns a deterministic order", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    const out = await setWorkflows(ctx, {
      // Intentionally doubled + out of canonical order.
      enabledWorkflows: ["docs", "finance", "docs", "finance"],
    });

    expect(out.enabledWorkflows.filter(w => w === "docs")).toHaveLength(1);
    // Order follows ALL_WORKFLOWS: finance precedes docs.
    expect(out.enabledWorkflows.indexOf("finance")).toBeLessThan(out.enabledWorkflows.indexOf("docs"));
  });

  it("self-heals a missing config row via upsert", async () => {
    const org = await createOrg("No Config Org", "no-config-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    // Deliberately NO config row created.
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    const out = await setWorkflows(ctx, { enabledWorkflows: ["finance"] });

    const row = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(row).not.toBeNull();
    expect(new Set(row?.enabledWorkflows)).toEqual(new Set(out.enabledWorkflows));
  });

  it("emits an org.config.updated operational event", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    await setWorkflows(ctx, { enabledWorkflows: ["finance"] });

    const events = await testPrisma.operationalEvent.findMany({
      where: { organizationId: org.id, action: "org.config.updated" },
    });
    expect(events).toHaveLength(1);
  });
});

describe("setWorkflows: authorization", () => {
  it("rejects a non-admin member with ForbiddenError", async () => {
    const { org } = await seedAdminOrg();
    const member = await createBrother({ orgId: org.id, isOrgAdmin: false });
    const ctx = ctxFor(org.id, member.id, { isOrgAdmin: false });

    await expect(setWorkflows(ctx, { enabledWorkflows: ["finance"] })).rejects.toBeInstanceOf(ForbiddenError);

    // The config row must be unchanged.
    const row = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(new Set(row?.enabledWorkflows)).toEqual(new Set(["members", "events", "operations"]));
  });

  it("allows a platform admin", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: false, isPlatformAdmin: true });

    const out = await setWorkflows(ctx, { enabledWorkflows: ["service"] });
    expect(out.enabledWorkflows).toContain("service");
  });
});

describe("setWorkflows: tenancy", () => {
  it("only writes the actor's own org config", async () => {
    const { org: orgA, admin: adminA } = await seedAdminOrg();
    const orgB = await createOrg("Other Org", "other-org");
    await testPrisma.organizationConfig.create({
      data: { organizationId: orgB.id, enabledWorkflows: ["parties"] },
    });

    const ctx = ctxFor(orgA.id, adminA.id, { isOrgAdmin: true });
    await setWorkflows(ctx, { enabledWorkflows: ["finance"] });

    // Org B is untouched — the scoped db only ever addresses orgA's row.
    const bRow = await testPrisma.organizationConfig.findUnique({ where: { organizationId: orgB.id } });
    expect(bRow?.enabledWorkflows).toEqual(["parties"]);
  });
});

describe("setThresholds: happy path", () => {
  it("persists the chosen cutoffs and returns the resolved set", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    const out = await setThresholds(ctx, SAMPLE_THRESHOLDS);
    expect(out).toEqual(SAMPLE_THRESHOLDS);

    const row = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(row?.thresholds).toEqual(SAMPLE_THRESHOLDS);
  });

  it("self-heals a missing config row via upsert", async () => {
    const org = await createOrg("No Config Org", "no-config-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    // Deliberately NO config row created.
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    await setThresholds(ctx, SAMPLE_THRESHOLDS);

    const row = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(row).not.toBeNull();
    expect(row?.thresholds).toEqual(SAMPLE_THRESHOLDS);
  });

  it("emits an org.config.updated operational event", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    await setThresholds(ctx, SAMPLE_THRESHOLDS);

    const events = await testPrisma.operationalEvent.findMany({
      where: { organizationId: org.id, action: "org.config.updated" },
    });
    expect(events).toHaveLength(1);
  });
});

describe("setThresholds: authorization", () => {
  it("rejects a non-admin member with ForbiddenError", async () => {
    const { org } = await seedAdminOrg();
    const member = await createBrother({ orgId: org.id, isOrgAdmin: false });
    const ctx = ctxFor(org.id, member.id, { isOrgAdmin: false });

    await expect(setThresholds(ctx, SAMPLE_THRESHOLDS)).rejects.toBeInstanceOf(ForbiddenError);

    // The config row keeps its default thresholds.
    const row = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(row?.thresholds).toEqual({});
  });

  it("allows a platform admin", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: false, isPlatformAdmin: true });

    const out = await setThresholds(ctx, SAMPLE_THRESHOLDS);
    expect(out.serviceHoursGoal).toBe(SAMPLE_THRESHOLDS.serviceHoursGoal);
  });
});

describe("setThresholds: sanitization", () => {
  it("drops out-of-range values back to defaults before persisting", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    // GPA of 9 is out of the 0–4 range; the resolver replaces it with the default.
    const out = await setThresholds(ctx, { ...SAMPLE_THRESHOLDS, gpaWatch: 9 });

    expect(out.gpaWatch).toBe(DEFAULT_THRESHOLDS.gpaWatch);
    expect(out.attendanceAtRisk).toBe(SAMPLE_THRESHOLDS.attendanceAtRisk);
  });
});

describe("setDisabledFeatures: happy path", () => {
  it("persists the chosen disabled sections and returns the normalized map", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    const out = await setDisabledFeatures(ctx, {
      disabledFeatures: { operations: ["health", "kpi-dues"] },
    });
    expect(new Set(out.operations)).toEqual(new Set(["health", "kpi-dues"]));

    const row = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(new Set((row?.disabledFeatures as Record<string, string[]>).operations))
      .toEqual(new Set(["health", "kpi-dues"]));
  });

  it("self-heals a missing config row via upsert", async () => {
    const org = await createOrg("No Config Org", "no-config-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    // Deliberately NO config row created.
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    await setDisabledFeatures(ctx, { disabledFeatures: { operations: ["health"] } });

    const row = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(row).not.toBeNull();
    expect((row?.disabledFeatures as Record<string, string[]>).operations).toEqual(["health"]);
  });

  it("emits an org.config.updated operational event", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    await setDisabledFeatures(ctx, { disabledFeatures: { operations: ["health"] } });

    const events = await testPrisma.operationalEvent.findMany({
      where: { organizationId: org.id, action: "org.config.updated" },
    });
    expect(events).toHaveLength(1);
  });
});

describe("setDisabledFeatures: normalization", () => {
  it("drops unknown workflow ids, unknown feature ids, and empty lists", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    const out = await setDisabledFeatures(ctx, {
      disabledFeatures: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        operations: ["health", "not-a-real-feature"] as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ["not-a-workflow" as any]: ["whatever"],
        // Empty list — dropped entirely.
        finance: [],
      },
    });

    expect(out.operations).toEqual(["health"]);
    expect(out).not.toHaveProperty("not-a-workflow");
    expect(out).not.toHaveProperty("finance");
  });
});

describe("setDisabledFeatures: authorization", () => {
  it("rejects a non-admin member with ForbiddenError", async () => {
    const { org } = await seedAdminOrg();
    const member = await createBrother({ orgId: org.id, isOrgAdmin: false });
    const ctx = ctxFor(org.id, member.id, { isOrgAdmin: false });

    await expect(
      setDisabledFeatures(ctx, { disabledFeatures: { operations: ["health"] } }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // The config row keeps its default (empty) disabled map.
    const row = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(row?.disabledFeatures).toEqual({});
  });

  it("allows a platform admin", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: false, isPlatformAdmin: true });

    const out = await setDisabledFeatures(ctx, { disabledFeatures: { operations: ["health"] } });
    expect(out.operations).toEqual(["health"]);
  });
});

describe("setDisabledFeatures: tenancy", () => {
  it("only writes the actor's own org config", async () => {
    const { org: orgA, admin: adminA } = await seedAdminOrg();
    const orgB = await createOrg("Other Org", "other-org");
    await testPrisma.organizationConfig.create({
      data: { organizationId: orgB.id, enabledWorkflows: ["parties"], disabledFeatures: { operations: ["health"] } },
    });

    const ctx = ctxFor(orgA.id, adminA.id, { isOrgAdmin: true });
    await setDisabledFeatures(ctx, { disabledFeatures: { operations: ["health"] } });

    // Org B is untouched — the scoped db only ever addresses orgA's row.
    const bRow = await testPrisma.organizationConfig.findUnique({ where: { organizationId: orgB.id } });
    expect(bRow?.disabledFeatures).toEqual({ operations: ["health"] });
  });
});

describe("completeOnboarding", () => {
  it("stamps onboardingCompletedAt for an admin", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    const before = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(before?.onboardingCompletedAt).toBeNull();

    const { completedAt } = await completeOnboarding(ctx);
    expect(completedAt).toBeInstanceOf(Date);

    const after = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(after?.onboardingCompletedAt).not.toBeNull();
  });

  it("is idempotent — a second call keeps the original timestamp", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    const first = await completeOnboarding(ctx);
    const second = await completeOnboarding(ctx);
    expect(second.completedAt.getTime()).toBe(first.completedAt.getTime());
  });

  it("rejects a non-admin", async () => {
    const { org, admin } = await seedAdminOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: false });
    await expect(completeOnboarding(ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("only stamps the actor's own org", async () => {
    const { org: orgA, admin: adminA } = await seedAdminOrg();
    const orgB = await createOrg("Other Org", "other-org");
    await testPrisma.organizationConfig.create({
      data: { organizationId: orgB.id, enabledWorkflows: ["operations"] },
    });

    const ctx = ctxFor(orgA.id, adminA.id, { isOrgAdmin: true });
    await completeOnboarding(ctx);

    const bRow = await testPrisma.organizationConfig.findUnique({ where: { organizationId: orgB.id } });
    expect(bRow?.onboardingCompletedAt).toBeNull();
  });
});
