/**
 * Tests for updateSemester — the "extend current" action behind the no-active-
 * semester gate (lib/services/semester-service.ts). It pushes a semester's dates
 * out and reactivates it, enforcing one-active-per-org and endDate >= startDate,
 * scoped to the caller's org.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import { updateSemester } from "@/lib/services/semester-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
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
    isOrgAdmin:      true,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

async function seed() {
  const org = await createOrg("Extend Org", "extend-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  return { ctx: ctxFor(org.id, admin.id), org, admin };
}

describe("updateSemester", () => {
  it("extends the end date and reactivates a deactivated semester", async () => {
    const { ctx, org } = await seed();
    const sem = await createSemester({
      orgId: org.id, label: "Fall 2026", startDate: "2026-08-01", endDate: "2026-12-15", isActive: false,
    });

    const result = await updateSemester(ctx, sem.id, { endDate: "2027-05-15" });

    expect(result.endDate).toBe("2027-05-15");
    expect(result.isActive).toBe(true);

    const row = await testPrisma.semester.findUnique({ where: { id: sem.id } });
    expect(row?.endDate).toBe("2027-05-15");
    expect(row?.isActive).toBe(true);
  });

  it("deactivates any other active semester (one active per org)", async () => {
    const { ctx, org } = await seed();
    const oldActive = await createSemester({ orgId: org.id, label: "Spring 2026", isActive: true });
    const target = await createSemester({
      orgId: org.id, label: "Fall 2026", startDate: "2026-08-01", endDate: "2026-12-15", isActive: false,
    });

    await updateSemester(ctx, target.id, { endDate: "2027-01-31" });

    const old = await testPrisma.semester.findUnique({ where: { id: oldActive.id } });
    expect(old?.isActive).toBe(false);
  });

  it("activate: false (Settings' Edit) fixes the dates and leaves the active term alone", async () => {
    const { ctx, org } = await seed();
    const active = await createSemester({ orgId: org.id, label: "Fall 2026", startDate: "2026-08-22", endDate: "2028-12-30", isActive: true });
    const other = await createSemester({ orgId: org.id, label: "Spring 2026", startDate: "2026-01-10", endDate: "2026-05-10", isActive: false });

    const fixed = await updateSemester(ctx, active.id, { endDate: "2026-12-30", activate: false });
    expect(fixed).toMatchObject({ endDate: "2026-12-30", isActive: true });

    await updateSemester(ctx, other.id, { label: "Spring '26", activate: false });
    const rows = await testPrisma.semester.findMany({ where: { organizationId: org.id }, orderBy: { id: "asc" } });
    expect(rows.map(r => [r.label, r.isActive])).toEqual([["Fall 2026", true], ["Spring '26", false]]);
  });

  it("rejects an end date before the start date", async () => {
    const { ctx, org } = await seed();
    const sem = await createSemester({
      orgId: org.id, startDate: "2026-08-01", endDate: "2026-12-15", isActive: false,
    });

    await expect(updateSemester(ctx, sem.id, { endDate: "2026-07-31" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a semester id belonging to another org", async () => {
    const { ctx } = await seed();
    const other = await createOrg("Other Org", "other-org");
    const foreign = await createSemester({ orgId: other.id, isActive: false });

    await expect(updateSemester(ctx, foreign.id, { endDate: "2027-05-15" })).rejects.toBeInstanceOf(NotFoundError);

    // The foreign semester is untouched.
    const row = await testPrisma.semester.findUnique({ where: { id: foreign.id } });
    expect(row?.isActive).toBe(false);
  });
});
