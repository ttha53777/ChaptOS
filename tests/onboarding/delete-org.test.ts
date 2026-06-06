/**
 * Tests for deleteOrg() — permanent organization deletion.
 *
 * This is the most destructive path in the app, so the tests assert the full
 * cascade (every child table emptied), the member re-home/delete rules, the
 * admin gate, slug confirmation, and tenant isolation (a second org is never
 * touched). We drive the service directly against the test DB.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import {
  createBrother, createSemester, createCalendarEvent, createTransaction,
  createServiceEvent, createPartyEvent, createDeadline, createInstagramTask,
  createDoc, createBudget, createActivityLog, createAnnouncement,
} from "../setup/factories";
import { provisionOrg, deleteOrg, summarizeOrgForDeletion } from "@/lib/services/org-service";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

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

/** Seed an org with at least one row in every child table that deleteOrg touches. */
async function seedFullOrg(slug: string) {
  const { organizationId, brotherId } = await provisionOrg(
    { name: `Org ${slug}`, slug, orgType: "fraternity", founderName: "Founder" },
    `auth-${slug}-${randomUUID()}`,
    `${slug}@example.com`,
  );

  const sem = await createSemester({ orgId: organizationId });
  const cal = await createCalendarEvent({ orgId: organizationId });
  await testPrisma.attendanceRecord.create({
    data: { calendarEventId: cal.id, brotherId, semesterId: sem.id, attended: true },
  });
  await testPrisma.attendanceExcuse.create({
    data: { calendarEventId: cal.id, brotherId, semesterId: sem.id, reason: "sick" },
  });
  await createServiceEvent({ orgId: organizationId });
  await createPartyEvent({ orgId: organizationId });
  await createDeadline({ orgId: organizationId });
  await createInstagramTask({ orgId: organizationId });
  await createDoc({ orgId: organizationId });
  await createTransaction({ orgId: organizationId });
  const budget = await createBudget({ orgId: organizationId });
  await testPrisma.budgetAllocation.create({
    data: { budgetId: budget.id, category: "Events", percent: 50 },
  });
  await createActivityLog({ orgId: organizationId });
  await createAnnouncement({ orgId: organizationId });

  return { organizationId, brotherId };
}

async function childCounts(orgId: number) {
  const [
    config, memberships, roles, brotherRoles, semesters, calendarEvents, serviceEvents,
    parties, deadlines, igTasks, docs, transactions, budgets, activityLogs, announcements,
    operationalEvents,
  ] = await Promise.all([
    testPrisma.organizationConfig.count({ where: { organizationId: orgId } }),
    testPrisma.membership.count({ where: { organizationId: orgId } }),
    testPrisma.role.count({ where: { organizationId: orgId } }),
    testPrisma.brotherRole.count({ where: { organizationId: orgId } }),
    testPrisma.semester.count({ where: { organizationId: orgId } }),
    testPrisma.calendarEvent.count({ where: { organizationId: orgId } }),
    testPrisma.serviceEvent.count({ where: { organizationId: orgId } }),
    testPrisma.partyEvent.count({ where: { organizationId: orgId } }),
    testPrisma.deadline.count({ where: { organizationId: orgId } }),
    testPrisma.instagramTask.count({ where: { organizationId: orgId } }),
    testPrisma.doc.count({ where: { organizationId: orgId } }),
    testPrisma.transaction.count({ where: { organizationId: orgId } }),
    testPrisma.budget.count({ where: { organizationId: orgId } }),
    testPrisma.activityLog.count({ where: { organizationId: orgId } }),
    testPrisma.chapterAnnouncement.count({ where: { organizationId: orgId } }),
    testPrisma.operationalEvent.count({ where: { organizationId: orgId } }),
  ]);
  return {
    config, memberships, roles, brotherRoles, semesters, calendarEvents, serviceEvents,
    parties, deadlines, igTasks, docs, transactions, budgets, activityLogs, announcements,
    operationalEvents,
  };
}

describe("deleteOrg: full cascade", () => {
  it("removes the org and every child row across all tables", async () => {
    const { organizationId } = await seedFullOrg("nuke-me");
    const founder = await testPrisma.brother.findFirstOrThrow({ where: { organizationId } });

    // Sanity: there's actually data to delete.
    const before = await childCounts(organizationId);
    for (const [k, v] of Object.entries(before)) {
      expect(v, `expected seeded ${k} > 0`).toBeGreaterThan(0);
    }

    const ctx = ctxFor(organizationId, founder.id, { isOrgAdmin: true });
    const out = await deleteOrg(ctx, "nuke-me");
    expect(out.organizationId).toBe(organizationId);

    // Org gone.
    expect(await testPrisma.organization.findUnique({ where: { id: organizationId } })).toBeNull();

    // Every child table emptied for this org.
    const after = await childCounts(organizationId);
    for (const [k, v] of Object.entries(after)) {
      expect(v, `expected ${k} == 0 after delete`).toBe(0);
    }

    // No-org-column join tables also gone.
    expect(await testPrisma.attendanceRecord.count()).toBe(0);
    expect(await testPrisma.attendanceExcuse.count()).toBe(0);
    expect(await testPrisma.budgetAllocation.count()).toBe(0);
  });

  it("deletes a member whose ONLY/home org this is", async () => {
    const { organizationId, brotherId } = await seedFullOrg("solo-org");
    const ctx = ctxFor(organizationId, brotherId, { isOrgAdmin: true });
    await deleteOrg(ctx, "solo-org");
    expect(await testPrisma.brother.findUnique({ where: { id: brotherId } })).toBeNull();
  });

  it("deletes a home-only founder who is ALSO a platform admin (PlatformAdmin FK is RESTRICT)", async () => {
    // Regression for the C1 bug: PlatformAdmin.brotherId → Brother is ON DELETE
    // NO ACTION, so deleting the brother fails unless we remove the PlatformAdmin
    // row first. The founder testing their own org is exactly this person.
    const { organizationId, brotherId } = await seedFullOrg("plat-founder");
    await testPrisma.platformAdmin.create({ data: { brotherId } });

    const ctx = ctxFor(organizationId, brotherId, { isOrgAdmin: true, isPlatformAdmin: true });
    await deleteOrg(ctx, "plat-founder"); // must not throw an FK violation

    expect(await testPrisma.organization.findUnique({ where: { id: organizationId } })).toBeNull();
    expect(await testPrisma.brother.findUnique({ where: { id: brotherId } })).toBeNull();
    expect(await testPrisma.platformAdmin.findUnique({ where: { brotherId } })).toBeNull();
  });

  it("re-homed multi-org founder keeps their PlatformAdmin row", async () => {
    // A platform admin who survives deletion (re-homed to another org) must NOT
    // lose their superadmin status — we only delete PlatformAdmin rows for
    // brothers being deleted, not re-homed ones.
    const a = await seedFullOrg("plat-home");
    const b = await seedFullOrg("plat-other");
    const founder = await testPrisma.brother.findFirstOrThrow({ where: { organizationId: a.organizationId } });
    await testPrisma.platformAdmin.create({ data: { brotherId: founder.id } });
    await testPrisma.membership.create({
      data: { brotherId: founder.id, organizationId: b.organizationId, isOrgAdmin: false },
    });

    const ctx = ctxFor(a.organizationId, founder.id, { isOrgAdmin: true, isPlatformAdmin: true });
    await deleteOrg(ctx, "plat-home");

    expect(await testPrisma.brother.findUnique({ where: { id: founder.id } })).not.toBeNull();
    expect(await testPrisma.platformAdmin.findUnique({ where: { brotherId: founder.id } })).not.toBeNull();
  });
});

describe("deleteOrg: multi-org member re-homing", () => {
  it("preserves a member with another org and re-homes them", async () => {
    // Org A (home) and Org B; the same Brother belongs to both.
    const a = await seedFullOrg("home-org");
    const b = await seedFullOrg("other-org");
    const founder = await testPrisma.brother.findFirstOrThrow({ where: { organizationId: a.organizationId } });

    // Give the founder a Membership in B too (simulating a multi-org member).
    await testPrisma.membership.create({
      data: { brotherId: founder.id, organizationId: b.organizationId, isOrgAdmin: false },
    });

    const ctx = ctxFor(a.organizationId, founder.id, { isOrgAdmin: true });
    await deleteOrg(ctx, "home-org");

    // Brother survives and is re-homed to org B.
    const survivor = await testPrisma.brother.findUnique({ where: { id: founder.id } });
    expect(survivor).not.toBeNull();
    expect(survivor!.organizationId).toBe(b.organizationId);

    // Org B is fully intact.
    expect(await testPrisma.organization.findUnique({ where: { id: b.organizationId } })).not.toBeNull();
  });
});

describe("deleteOrg: tenancy", () => {
  it("never touches another org's data", async () => {
    const a = await seedFullOrg("victim");
    const b = await seedFullOrg("bystander");
    const bBefore = await childCounts(b.organizationId);

    const founderA = await testPrisma.brother.findFirstOrThrow({ where: { organizationId: a.organizationId } });
    const ctx = ctxFor(a.organizationId, founderA.id, { isOrgAdmin: true });
    await deleteOrg(ctx, "victim");

    const bAfter = await childCounts(b.organizationId);
    expect(bAfter).toEqual(bBefore);
    expect(await testPrisma.organization.findUnique({ where: { id: b.organizationId } })).not.toBeNull();
  });
});

describe("deleteOrg: authorization & confirmation", () => {
  it("rejects a non-admin with ForbiddenError and deletes nothing", async () => {
    const { organizationId } = await seedFullOrg("guarded");
    const member = await createBrother({ orgId: organizationId, isOrgAdmin: false });
    const ctx = ctxFor(organizationId, member.id, { isOrgAdmin: false });

    await expect(deleteOrg(ctx, "guarded")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await testPrisma.organization.findUnique({ where: { id: organizationId } })).not.toBeNull();
  });

  it("allows a platform admin", async () => {
    const { organizationId, brotherId } = await seedFullOrg("plat-del");
    const ctx = ctxFor(organizationId, brotherId, { isOrgAdmin: false, isPlatformAdmin: true });
    await deleteOrg(ctx, "plat-del");
    expect(await testPrisma.organization.findUnique({ where: { id: organizationId } })).toBeNull();
  });

  it("rejects a slug mismatch with ValidationError and deletes nothing", async () => {
    const { organizationId, brotherId } = await seedFullOrg("typo-org");
    const ctx = ctxFor(organizationId, brotherId, { isOrgAdmin: true });

    await expect(deleteOrg(ctx, "wrong-slug")).rejects.toBeInstanceOf(ValidationError);
    expect(await testPrisma.organization.findUnique({ where: { id: organizationId } })).not.toBeNull();
  });
});

describe("summarizeOrgForDeletion", () => {
  it("counts the org's data and throws NotFound for a missing org", async () => {
    const { organizationId, brotherId } = await seedFullOrg("count-org");
    const ctx = ctxFor(organizationId, brotherId, { isOrgAdmin: true });

    const summary = await summarizeOrgForDeletion(ctx);
    expect(summary.slug).toBe("count-org");
    expect(summary.members).toBeGreaterThan(0);
    expect(summary.events).toBeGreaterThan(0);
    expect(summary.transactions).toBeGreaterThan(0);

    const ghostCtx = ctxFor(999999, brotherId, { isOrgAdmin: true });
    await expect(summarizeOrgForDeletion(ghostCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a non-admin member with ForbiddenError", async () => {
    const { organizationId } = await seedFullOrg("summary-guard");
    const member = await createBrother({ orgId: organizationId, isOrgAdmin: false });
    const ctx = ctxFor(organizationId, member.id, { isOrgAdmin: false });
    await expect(summarizeOrgForDeletion(ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("excludes ghost brothers from the member count", async () => {
    const { organizationId, brotherId } = await seedFullOrg("ghost-count");
    const realBefore = await summarizeOrgForDeletion(ctxFor(organizationId, brotherId, { isOrgAdmin: true }));
    await testPrisma.brother.create({
      data: {
        organizationId, name: "Ghost", role: "Brother",
        attendance: 0, duesOwed: 0, gpa: 0, serviceHours: 0, isAdmin: false, isGhost: true,
      },
    });
    const realAfter = await summarizeOrgForDeletion(ctxFor(organizationId, brotherId, { isOrgAdmin: true }));
    expect(realAfter.members).toBe(realBefore.members); // ghost didn't change the count
  });
});
