/**
 * Reimbursement service tests.
 *
 * A reimbursement is a self-service request: any member may file for themselves;
 * filing on another member's behalf requires treasury authority. The target
 * brother must belong to the caller's org (no cross-tenant reference/leak).
 *
 * Also pins the BigInt serialization contract: amountCents is persisted for
 * finance precision but stripped from every returned object, because
 * Response.json() throws on a raw bigint.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import {
  createReimbursement,
  updateReimbursement,
  listReimbursements,
} from "@/lib/services/reimbursement-service";
import { PERMISSIONS } from "@/lib/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { updateReimbursementInput } from "@/lib/validation/reimbursement";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number, opts?: { permissions?: number; isOrgAdmin?: boolean }): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     opts?.permissions ?? 0,
    maxRank:         0,
    isOrgAdmin:      opts?.isOrgAdmin ?? false,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

const baseInput = (brotherId: number) => ({
  brotherId,
  amount:      210,
  date:        "2026-06-01",
  description: "Conclave travel fuel",
});

describe("createReimbursement — authorization", () => {
  it("a regular member can file for themselves (201-equivalent)", async () => {
    const org = await createOrg("Alpha", "alpha");
    const member = await createBrother({ orgId: org.id, name: "Self" });
    const ctx = ctxFor(org.id, member.id);

    const r = await createReimbursement(ctx, baseInput(member.id));
    expect(r.brotherId).toBe(member.id);
    expect(r.status).toBe("pending");
    // The brother relation is included at runtime (used by the UI card); the
    // tenant wrapper's create() doesn't narrow the include into the static type,
    // so assert through a cast — same accommodation transaction-service makes.
    expect((r as unknown as { brother: { name: string } }).brother.name).toBe("Self");
  });

  it("a regular member CANNOT file for another member (ForbiddenError → 403)", async () => {
    const org = await createOrg("Alpha", "alpha");
    const member = await createBrother({ orgId: org.id, name: "Self" });
    const other  = await createBrother({ orgId: org.id, name: "Other" });
    const ctx = ctxFor(org.id, member.id);

    await expect(createReimbursement(ctx, baseInput(other.id))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a treasurer (MANAGE_TREASURY) can file for another in-org member", async () => {
    const org = await createOrg("Alpha", "alpha");
    const treasurer = await createBrother({ orgId: org.id, name: "Treasurer" });
    const other     = await createBrother({ orgId: org.id, name: "Other" });
    const ctx = ctxFor(org.id, treasurer.id, { permissions: PERMISSIONS.MANAGE_TREASURY });

    const r = await createReimbursement(ctx, baseInput(other.id));
    expect(r.brotherId).toBe(other.id);
  });

  it("an org admin can file for another in-org member", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, name: "Admin", isOrgAdmin: true });
    const other = await createBrother({ orgId: org.id, name: "Other" });
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });

    const r = await createReimbursement(ctx, baseInput(other.id));
    expect(r.brotherId).toBe(other.id);
  });
});

describe("createReimbursement — cross-tenant guard", () => {
  it("filing for a brother in a DIFFERENT org throws NotFoundError (no leak, → 404)", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    // A privileged actor in org A — so we get past the auth gate and hit the
    // brother lookup, proving the tenant scope (not just the self check) blocks it.
    const adminA   = await createBrother({ orgId: orgA.id, name: "AdminA", isOrgAdmin: true });
    const brotherB = await createBrother({ orgId: orgB.id, name: "ForeignB" });
    const ctx = ctxFor(orgA.id, adminA.id, { isOrgAdmin: true });

    await expect(createReimbursement(ctx, baseInput(brotherB.id))).rejects.toBeInstanceOf(NotFoundError);
    // And nothing was written under org A.
    expect(await testPrisma.reimbursement.count({ where: { organizationId: orgA.id } })).toBe(0);
  });
});

describe("createReimbursement — amountCents + BigInt serialization", () => {
  it("persists amountCents in the DB but strips it from the returned object", async () => {
    const org = await createOrg("Alpha", "alpha");
    const member = await createBrother({ orgId: org.id });
    const ctx = ctxFor(org.id, member.id);

    const r = await createReimbursement(ctx, baseInput(member.id)); // amount 210

    // Stripped from the API-facing object (or JSON.stringify would throw on bigint).
    expect("amountCents" in r).toBe(false);
    expect(() => JSON.stringify(r)).not.toThrow();

    // But persisted at cents precision in the row.
    const row = await testPrisma.reimbursement.findUnique({ where: { id: r.id } });
    expect(row?.amountCents).toBe(BigInt(21000));
  });
});

describe("listReimbursements / updateReimbursement", () => {
  it("list strips amountCents from every row and is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const mA = await createBrother({ orgId: orgA.id });
    const mB = await createBrother({ orgId: orgB.id });
    await createReimbursement(ctxFor(orgA.id, mA.id), baseInput(mA.id));
    await createReimbursement(ctxFor(orgB.id, mB.id), baseInput(mB.id));

    const rows = await listReimbursements(ctxFor(orgA.id, mA.id));
    expect(rows).toHaveLength(1);
    expect(rows.every(r => !("amountCents" in r))).toBe(true);
    expect(() => JSON.stringify(rows)).not.toThrow();
  });

  it("validation rejects an unknown status value (→ 400)", () => {
    expect(updateReimbursementInput.safeParse({ status: "paid" }).success).toBe(false);
    expect(updateReimbursementInput.safeParse({ status: "approved" }).success).toBe(true);
  });

  it("update returns a serializable object (amountCents stripped)", async () => {
    const org = await createOrg("Alpha", "alpha");
    const treasurer = await createBrother({ orgId: org.id });
    const ctx = ctxFor(org.id, treasurer.id, { permissions: PERMISSIONS.MANAGE_TREASURY });
    const created = await createReimbursement(ctx, baseInput(treasurer.id));

    const updated = await updateReimbursement(ctx, created.id, { status: "approved" });
    expect(updated.status).toBe("approved");
    expect("amountCents" in updated).toBe(false);
    expect(() => JSON.stringify(updated)).not.toThrow();
  });
});
