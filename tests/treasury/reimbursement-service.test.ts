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
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import {
  createReimbursement,
  updateReimbursement,
  listReimbursements,
} from "@/lib/services/reimbursement-service";
import { PERMISSIONS } from "@/lib/permissions";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
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

/**
 * Approval is money movement.
 *
 * Every balance in the app — the treasury page, /api/treasury, the dashboard, the
 * AI's treasury and budget tools — is derived by summing Transaction rows. Nothing
 * reads Reimbursement. So until approval mints a ledger row, an approved payout is
 * structurally invisible: the money leaves the chapter's account and no figure in
 * the product moves. These tests pin that it does, exactly once, in the right bucket.
 */
describe("updateReimbursement — approval mints the ledger entry", () => {
  async function seed(opts?: { amount?: number; category?: string | null }) {
    const org = await createOrg("Alpha", "alpha");
    const semester = await createSemester({ orgId: org.id, label: "SP26", isActive: true });
    const requester = await createBrother({ orgId: org.id, name: "Requester" });
    const treasurer = await createBrother({ orgId: org.id, name: "Treasurer" });
    const ctx = ctxFor(org.id, treasurer.id, { permissions: PERMISSIONS.MANAGE_TREASURY });
    const filerCtx = ctxFor(org.id, requester.id);
    const r = await createReimbursement(filerCtx, {
      ...baseInput(requester.id),
      amount:   opts?.amount ?? 400,
      category: opts?.category === undefined ? "Events" : opts.category,
    });
    return { org, semester, requester, treasurer, ctx, reimbursement: r };
  }

  const expensesFor = (orgId: number) =>
    testPrisma.transaction.findMany({ where: { organizationId: orgId, deletedAt: null, type: "expense" } });

  it("approving creates exactly one posted expense, linked, in the requested category", async () => {
    const { org, semester, ctx, reimbursement } = await seed({ amount: 400, category: "Events" });

    // Before: the request exists, the books know nothing about it.
    expect(await expensesFor(org.id)).toHaveLength(0);

    const approved = await updateReimbursement(ctx, reimbursement.id, { status: "approved" });

    const expenses = await expensesFor(org.id);
    expect(expenses).toHaveLength(1);
    const ledger = expenses[0];
    expect(ledger.type).toBe("expense");
    expect(ledger.status).toBe("posted");
    expect(ledger.amount).toBe(400);
    expect(ledger.amountCents).toBe(BigInt(40_000));
    expect(ledger.category).toBe("Events");
    expect(ledger.date).toBe(reimbursement.date);
    expect(ledger.organizationId).toBe(org.id);
    // The semester LABEL is what getBudget matches on — semesterId alone is not enough.
    expect(ledger.semester).toBe("SP26");
    expect(ledger.semesterId).toBe(semester.id);
    // The ledger line names the payee, so an officer scanning the transaction log
    // can see who the money went to without opening the reimbursement.
    expect(ledger.description).toBe("Reimbursement: Requester - Conclave travel fuel");

    // And the two books are linked, both in the row and in the returned object.
    expect(approved.transactionId).toBe(ledger.id);
    const row = await testPrisma.reimbursement.findUnique({ where: { id: reimbursement.id } });
    expect(row?.transactionId).toBe(ledger.id);
  });

  it("the approved expense is visible to getBudget's exact query — the reported bug", async () => {
    const { org, ctx, reimbursement } = await seed({ amount: 400, category: "Events" });
    await updateReimbursement(ctx, reimbursement.id, { status: "approved" });

    // Mirrors lib/ai-tools.ts getBudget(): group expenses by category for the
    // active semester's label. This is the figure that read $0 while $400 was gone.
    const groups = await testPrisma.transaction.groupBy({
      by:     ["category"],
      where:  { organizationId: org.id, deletedAt: null, semester: "SP26", type: "expense" },
      _sum:   { amount: true },
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("Events");
    expect(groups[0]._sum.amount).toBe(400);
  });

  it("the treasurer can re-bucket at approval time", async () => {
    const { org, ctx, reimbursement } = await seed({ category: "Misc" });

    await updateReimbursement(ctx, reimbursement.id, { status: "approved", category: "Brotherhood" });

    const [ledger] = await expensesFor(org.id);
    expect(ledger.category).toBe("Brotherhood");
    const row = await testPrisma.reimbursement.findUnique({ where: { id: reimbursement.id } });
    expect(row?.category).toBe("Brotherhood");
  });

  it("an uncategorized request still hits the ledger (falls back, so the balance is never wrong)", async () => {
    const { org, ctx, reimbursement } = await seed({ category: null });

    await updateReimbursement(ctx, reimbursement.id, { status: "approved" });

    const [ledger] = await expensesFor(org.id);
    expect(ledger.category).toBe("Reimbursement");
    expect(ledger.amount).toBe(400);
  });

  it("the ledger description uses the payee's ORG-LOCAL name, not their account name", async () => {
    const org = await createOrg("Alpha", "alpha");
    await createSemester({ orgId: org.id, label: "SP26", isActive: true });
    // Same person, known as "Robert Chen" on their account but "Rob" in this org.
    const requester = await createBrother({ orgId: org.id, name: "Robert Chen", membershipName: "Rob" });
    const treasurer = await createBrother({ orgId: org.id, name: "Treasurer" });
    const ctx = ctxFor(org.id, treasurer.id, { permissions: PERMISSIONS.MANAGE_TREASURY });
    const r = await createReimbursement(ctxFor(org.id, requester.id), {
      ...baseInput(requester.id), amount: 400, category: "Events",
    });

    const approved = await updateReimbursement(ctx, r.id, { status: "approved" });

    const ledger = await testPrisma.transaction.findUnique({ where: { id: approved.transactionId! } });
    expect(ledger!.description).toBe("Reimbursement: Rob - Conclave travel fuel");
  });

  it("declining creates no ledger entry", async () => {
    const { org, ctx, reimbursement } = await seed();

    const r = await updateReimbursement(ctx, reimbursement.id, { status: "rejected", rejectionNote: "No receipt" });

    expect(r.status).toBe("rejected");
    expect(r.transactionId).toBeNull();
    expect(await expensesFor(org.id)).toHaveLength(0);
  });
});

describe("updateReimbursement — the ledger row is minted exactly once", () => {
  async function seedApprovable() {
    const org = await createOrg("Alpha", "alpha");
    await createSemester({ orgId: org.id, label: "SP26", isActive: true });
    const requester = await createBrother({ orgId: org.id, name: "Requester" });
    const treasurer = await createBrother({ orgId: org.id, name: "Treasurer" });
    const ctx = ctxFor(org.id, treasurer.id, { permissions: PERMISSIONS.MANAGE_TREASURY });
    const r = await createReimbursement(ctxFor(org.id, requester.id), {
      ...baseInput(requester.id), amount: 400, category: "Events",
    });
    return { org, ctx, reimbursement: r };
  }

  it("two CONCURRENT approvals book the expense once (compare-and-set)", async () => {
    const { org, ctx, reimbursement } = await seedApprovable();

    // The treasurer double-clicks. Both requests read "pending" before either writes.
    // Without the conditional flip, both would mint a Transaction and the chapter
    // would be charged $800 for a $400 payout.
    const results = await Promise.allSettled([
      updateReimbursement(ctx, reimbursement.id, { status: "approved" }),
      updateReimbursement(ctx, reimbursement.id, { status: "approved" }),
    ]);

    const fulfilled = results.filter(r => r.status === "fulfilled");
    const rejected  = results.filter(r => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    const expenses = await testPrisma.transaction.findMany({
      where: { organizationId: org.id, deletedAt: null, type: "expense" },
    });
    expect(expenses).toHaveLength(1);
    expect(expenses[0].amount).toBe(400);
  });

  it("re-approving an already-approved request is a ConflictError, not a second expense", async () => {
    const { org, ctx, reimbursement } = await seedApprovable();

    await updateReimbursement(ctx, reimbursement.id, { status: "approved" });
    await expect(updateReimbursement(ctx, reimbursement.id, { status: "approved" }))
      .rejects.toBeInstanceOf(ConflictError);

    expect(await testPrisma.transaction.count({
      where: { organizationId: org.id, deletedAt: null, type: "expense" },
    })).toBe(1);
  });

  it("re-bucketing an approved request moves its ledger row too (the books stay in step)", async () => {
    const { org, ctx, reimbursement } = await seedApprovable();
    const approved = await updateReimbursement(ctx, reimbursement.id, { status: "approved" });

    // Correcting the category after the fact must not leave the expense filed under
    // the old budget line — that would put the two books back out of agreement.
    await updateReimbursement(ctx, reimbursement.id, { category: "House" });

    const ledger = await testPrisma.transaction.findUnique({ where: { id: approved.transactionId! } });
    expect(ledger!.category).toBe("House");
    expect(await testPrisma.transaction.count({
      where: { organizationId: org.id, deletedAt: null, type: "expense" },
    })).toBe(1);
  });
});

describe("updateReimbursement — reversing an approval takes the money back out", () => {
  it("un-approving soft-deletes the ledger row and unlinks it", async () => {
    const org = await createOrg("Alpha", "alpha");
    await createSemester({ orgId: org.id, label: "SP26", isActive: true });
    const requester = await createBrother({ orgId: org.id, name: "Requester" });
    const treasurer = await createBrother({ orgId: org.id, name: "Treasurer" });
    const ctx = ctxFor(org.id, treasurer.id, { permissions: PERMISSIONS.MANAGE_TREASURY });
    const r = await createReimbursement(ctxFor(org.id, requester.id), {
      ...baseInput(requester.id), amount: 400, category: "Events",
    });

    const approved = await updateReimbursement(ctx, r.id, { status: "approved" });
    const ledgerId = approved.transactionId!;
    expect(ledgerId).toBeTruthy();

    const reversed = await updateReimbursement(ctx, r.id, { status: "rejected", rejectionNote: "Duplicate claim" });

    expect(reversed.status).toBe("rejected");
    expect(reversed.transactionId).toBeNull();

    // The row still exists (audit trail) but is soft-deleted, which is what every
    // aggregation in the app filters on — so it has left every balance.
    const ledger = await testPrisma.transaction.findUnique({ where: { id: ledgerId } });
    expect(ledger).not.toBeNull();
    expect(ledger!.deletedAt).not.toBeNull();

    const live = await testPrisma.transaction.aggregate({
      where: { organizationId: org.id, deletedAt: null, type: "expense" },
      _sum:  { amount: true },
    });
    expect(live._sum.amount ?? 0).toBe(0);
  });

  it("re-approving after a reversal mints a fresh ledger row", async () => {
    const org = await createOrg("Alpha", "alpha");
    await createSemester({ orgId: org.id, label: "SP26", isActive: true });
    const member = await createBrother({ orgId: org.id, name: "Requester" });
    const treasurer = await createBrother({ orgId: org.id, name: "Treasurer" });
    const ctx = ctxFor(org.id, treasurer.id, { permissions: PERMISSIONS.MANAGE_TREASURY });
    const r = await createReimbursement(ctxFor(org.id, member.id), {
      ...baseInput(member.id), amount: 400, category: "Events",
    });

    const first = await updateReimbursement(ctx, r.id, { status: "approved" });
    await updateReimbursement(ctx, r.id, { status: "pending" });
    const second = await updateReimbursement(ctx, r.id, { status: "approved" });

    expect(second.transactionId).not.toBe(first.transactionId);
    // Exactly one live expense — the reversed one stays soft-deleted.
    const live = await testPrisma.transaction.findMany({
      where: { organizationId: org.id, deletedAt: null, type: "expense" },
    });
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(second.transactionId);
  });
});

describe("updateReimbursement — self-approval is allowed but recorded", () => {
  it("a treasurer approving their own request succeeds and is flagged in the audit trail", async () => {
    const org = await createOrg("Alpha", "alpha");
    await createSemester({ orgId: org.id, label: "SP26", isActive: true });
    const treasurer = await createBrother({ orgId: org.id, name: "Treasurer" });
    const ctx = ctxFor(org.id, treasurer.id, { permissions: PERMISSIONS.MANAGE_TREASURY });

    // The treasurer is very often the person who fronted the cash, so this is
    // permitted — but it must not pass silently.
    const own = await createReimbursement(ctx, { ...baseInput(treasurer.id), amount: 400, category: "Events" });
    const approved = await updateReimbursement(ctx, own.id, { status: "approved" });

    expect(approved.status).toBe("approved");
    expect(approved.transactionId).toBeTruthy();

    const event = await testPrisma.operationalEvent.findFirst({
      where:   { organizationId: org.id, action: "reimbursement.approved" },
      orderBy: { id: "desc" },
    });
    expect(event).not.toBeNull();
    expect(event!.metadata).toMatchObject({ selfApproved: true, transactionId: approved.transactionId });
  });

  it("approving someone else's request is not flagged", async () => {
    const org = await createOrg("Alpha", "alpha");
    await createSemester({ orgId: org.id, label: "SP26", isActive: true });
    const requester = await createBrother({ orgId: org.id, name: "Requester" });
    const treasurer = await createBrother({ orgId: org.id, name: "Treasurer" });
    const ctx = ctxFor(org.id, treasurer.id, { permissions: PERMISSIONS.MANAGE_TREASURY });
    const r = await createReimbursement(ctxFor(org.id, requester.id), {
      ...baseInput(requester.id), amount: 400, category: "Events",
    });

    await updateReimbursement(ctx, r.id, { status: "approved" });

    const event = await testPrisma.operationalEvent.findFirst({
      where:   { organizationId: org.id, action: "reimbursement.approved" },
      orderBy: { id: "desc" },
    });
    expect(event!.metadata).toMatchObject({ selfApproved: false });
  });
});

describe("updateReimbursement — tenancy", () => {
  it("the minted ledger row belongs to the approver's org, and another org can't approve it", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createSemester({ orgId: orgA.id, label: "SP26", isActive: true });
    const memberA = await createBrother({ orgId: orgA.id });
    const adminB  = await createBrother({ orgId: orgB.id, isOrgAdmin: true });
    const r = await createReimbursement(ctxFor(orgA.id, memberA.id), {
      ...baseInput(memberA.id), amount: 400, category: "Events",
    });

    // Org B cannot even see it, let alone approve it into its own books.
    const ctxB = ctxFor(orgB.id, adminB.id, { isOrgAdmin: true });
    await expect(updateReimbursement(ctxB, r.id, { status: "approved" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await testPrisma.transaction.count({ where: { organizationId: orgB.id } })).toBe(0);

    // And when org A approves, the expense lands in org A.
    const ctxA = ctxFor(orgA.id, memberA.id, { permissions: PERMISSIONS.MANAGE_TREASURY });
    const approved = await updateReimbursement(ctxA, r.id, { status: "approved" });
    const ledger = await testPrisma.transaction.findUnique({ where: { id: approved.transactionId! } });
    expect(ledger!.organizationId).toBe(orgA.id);
  });
});
