/**
 * Regression coverage for org-local display names (Membership.name).
 *
 * updateBrother lands a rename on Membership.name for the active org (see
 * brother-service.ts), not on the account-level Brother row. Every read path
 * that shows another member's name — attendance, excuses, roles, tasks — has
 * to resolve through ctx.db.membership.resolveNames (lib/db/tenant.ts) instead
 * of reading brother.name directly, or a rename in one org silently fails to
 * show up anywhere except the roster. This file exercises a representative
 * sample of those consumers.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import { submitExcuse, decideExcuse, listExcuses } from "@/lib/services/excuse-service";
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
    maxRank:         100,
    isOrgAdmin:      true,
    isPlatformAdmin: false,
    db:              db(orgId),
    ...over,
  };
}

describe("org-local display name propagation", () => {
  it("ctx.db.membership.resolveNames prefers the org-local name and falls back to Brother.name", async () => {
    const org = await createOrg("Name Org", "name-org");
    const renamed = await createBrother({ orgId: org.id, name: "Robert Chen", membershipName: "Rob" });
    const untouched = await createBrother({ orgId: org.id, name: "Sam Lee" });

    const names = await db(org.id).membership.resolveNames([
      { id: renamed.id, name: renamed.name },
      { id: untouched.id, name: untouched.name },
    ]);

    expect(names.get(renamed.id)).toBe("Rob");
    expect(names.get(untouched.id)).toBe("Sam Lee");
  });

  it("excuse review queue and decision events show the org-local name", async () => {
    const org = await createOrg("Excuse Name Org", "excuse-name-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true, name: "Admin" });
    const member = await createBrother({ orgId: org.id, name: "Robert Chen", membershipName: "Rob" });
    await testPrisma.semester.create({
      data: { organizationId: org.id, label: "TEST26", startDate: "2026-01-01", endDate: "2026-06-30", isActive: true },
    });
    const event = await testPrisma.calendarEvent.create({
      data: { organizationId: org.id, title: "Chapter Meeting", date: "2026-05-01", category: "chapter", mandatory: true },
    });

    const memberCtx = ctxFor(org.id, member.id, { isOrgAdmin: false, maxRank: 0 });
    await submitExcuse(memberCtx, { calendarEventId: event.id, reason: "Sick" });

    const adminCtx = ctxFor(org.id, admin.id);
    const pending = await listExcuses(adminCtx, { pendingOnly: true });
    expect(pending).toHaveLength(1);
    expect(pending[0].brotherName).toBe("Rob");

    const excuseId = (await testPrisma.attendanceExcuse.findFirstOrThrow({ where: { brotherId: member.id } })).id;
    await decideExcuse(adminCtx, excuseId, { action: "approve" });

    const approvedEvent = await testPrisma.operationalEvent.findFirst({
      where: { organizationId: org.id, action: "excuse.approved" },
      orderBy: { id: "desc" },
    });
    expect((approvedEvent?.metadata as { brotherName?: string })?.brotherName).toBe("Rob");
  });
});
