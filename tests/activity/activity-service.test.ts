/**
 * The activity feed's category pill: listRecentActivity pairs each ActivityLog
 * row with the OperationalEvent that wrote it, and must only ever look at the
 * requesting org's events.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import { listRecentActivity } from "@/lib/services/activity-service";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Tester", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: 0, maxRank: 0, isOrgAdmin: false, isPlatformAdmin: false, db: db(orgId),
  };
}

async function eventThenLog(orgId: number, actorId: number, action: string, message: string, at: Date) {
  await testPrisma.operationalEvent.create({ data: {
    organizationId: orgId, requestId: randomUUID(), actorId, action, subjectType: "Test", subjectId: 1, occurredAt: at,
  } });
  await testPrisma.activityLog.create({ data: {
    organizationId: orgId, actorId, type: "info", message, timestamp: new Date(at.getTime() + 40),
  } });
}

describe("listRecentActivity", () => {
  it("tags each row with its event's category, newest first", async () => {
    const org = await createOrg("Alpha", "alpha");
    const b = await createBrother({ orgId: org.id });
    await eventThenLog(org.id, b.id, "dues.paid", "paid dues", new Date("2026-10-01T12:00:00Z"));
    await eventThenLog(org.id, b.id, "reimbursement.created", "asked to be reimbursed", new Date("2026-10-02T12:00:00Z"));
    await testPrisma.activityLog.create({ data: { organizationId: org.id, actorId: b.id, type: "info", message: "legacy row", timestamp: new Date("2026-09-01T12:00:00Z") } });

    const feed = await listRecentActivity(ctxFor(org.id, b.id));
    expect(feed.map(f => [f.message, f.category])).toEqual([
      ["asked to be reimbursed", "request"],
      ["paid dues", "dues"],
      ["legacy row", null],
    ]);
  });

  it("never pairs with another org's event at the same instant", async () => {
    const a = await createOrg("Alpha", "alpha");
    const z = await createOrg("Zeta", "zeta");
    const b = await createBrother({ orgId: a.id });
    const at = new Date("2026-10-01T12:00:00Z");
    // Same actor id, same moment — only the org differs.
    await testPrisma.operationalEvent.create({ data: {
      organizationId: z.id, requestId: randomUUID(), actorId: b.id, action: "dues.paid", subjectType: "Test", subjectId: 1, occurredAt: at,
    } });
    await testPrisma.activityLog.create({ data: { organizationId: a.id, actorId: b.id, type: "info", message: "row", timestamp: new Date(at.getTime() + 40) } });

    const feed = await listRecentActivity(ctxFor(a.id, b.id));
    expect(feed).toHaveLength(1);
    expect(feed[0].category).toBeNull();
  });
});
