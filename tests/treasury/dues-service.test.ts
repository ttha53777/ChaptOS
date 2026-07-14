/**
 * Dues service tests.
 *
 * The invariant under test: a dues payment moves BOTH books or neither. Brother.duesOwed
 * and the Transaction ledger used to be maintained independently — the roster could say
 * every member was square while the ledger said the chapter had collected nothing, and
 * both numbers were shown to users as fact. Every test here is ultimately checking that
 * the two can no longer disagree.
 *
 * The concurrency test is the load-bearing one: a bare `{ decrement }` would fix the lost
 * update but still let two racing payments book double the income against a negative
 * balance. The balance predicate lives in the UPDATE's WHERE clause precisely so that
 * cannot happen.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import {
  recordDuesPayment,
  adjustDues,
  attributeDuesPayment,
  getDuesReconciliation,
} from "@/lib/services/dues-service";
import { softDeleteTransaction, updateTransaction } from "@/lib/services/transaction-service";
import { PERMISSIONS } from "@/lib/permissions";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
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
    permissions:     opts?.permissions ?? PERMISSIONS.MANAGE_TREASURY,
    maxRank:         0,
    isOrgAdmin:      opts?.isOrgAdmin ?? false,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

/** An org with an active semester and one member owing `owed`. */
async function chapterWithDebtor(owed = 75) {
  const org = await createOrg("Alpha", "alpha");
  await createSemester({ orgId: org.id, label: "SP26", isActive: true });
  const member = await createBrother({ orgId: org.id, name: "Noah Kim", duesOwed: owed });
  return { org, member, ctx: ctxFor(org.id, member.id) };
}

const duesRows = (orgId: number) =>
  testPrisma.transaction.findMany({ where: { organizationId: orgId, category: "Dues", deletedAt: null } });

describe("recordDuesPayment — both books move, or neither", () => {
  it("mints the ledger row AND decrements the balance", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);

    const res = await recordDuesPayment(ctx, { brotherId: member.id, amount: 75, date: "2026-07-14" });

    // Roster side.
    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(0);
    expect(res.duesOwed).toBe(0);

    // Ledger side — the half that never used to happen.
    const rows = await duesRows(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("income");
    expect(rows[0].amount).toBe(75);
    expect(rows[0].brotherId).toBe(member.id);   // attributable — reconciliation depends on it
    expect(rows[0].status).toBe("posted");
    expect(rows[0].date).toBe("2026-07-14");
  });

  it("stamps the semester LABEL and id, so budget spend can see the row", async () => {
    const { org, member, ctx } = await chapterWithDebtor();
    await recordDuesPayment(ctx, { brotherId: member.id, amount: 75, date: "2026-07-14" });

    const [row] = await duesRows(org.id);
    // Budget matches on the label, not semesterId — a row missing it is invisible there.
    expect(row.semester).toBe("SP26");
    expect(row.semesterId).not.toBeNull();
  });

  it("names the payee by their ORG-LOCAL name, matching the roster", async () => {
    const org = await createOrg("Alpha", "alpha");
    const member = await createBrother({
      orgId: org.id, name: "Legal Name", membershipName: "Chapter Name", duesOwed: 50,
    });
    const ctx = ctxFor(org.id, member.id);

    await recordDuesPayment(ctx, { brotherId: member.id, amount: 50, date: "2026-07-14" });
    const [row] = await duesRows(org.id);
    expect(row.description).toBe("Dues payment — Chapter Name");
  });

  it("persists exact amountCents but never returns a raw BigInt (Response.json would throw)", async () => {
    const { org, member, ctx } = await chapterWithDebtor(210);
    const res = await recordDuesPayment(ctx, { brotherId: member.id, amount: 210, date: "2026-07-14" });

    const [row] = await duesRows(org.id);
    expect(row.amountCents).toBe(BigInt(21000));
    expect(() => JSON.stringify(res)).not.toThrow();
  });

  it("a partial payment leaves the remainder owing", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);
    const res = await recordDuesPayment(ctx, { brotherId: member.id, amount: 25, date: "2026-07-14" });

    expect(res.duesOwed).toBe(50);
    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(50);

    const rows = await duesRows(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(25);
  });
});

describe("recordDuesPayment — the balance predicate in the WHERE clause", () => {
  it("refuses overpayment, and writes NO ledger row when it does", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);

    await expect(
      recordDuesPayment(ctx, { brotherId: member.id, amount: 100, date: "2026-07-14" }),
    ).rejects.toBeInstanceOf(ConflictError);

    // The refusal must be total: no income booked, no balance moved.
    expect(await duesRows(org.id)).toHaveLength(0);
    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(75);
  });

  it("two concurrent full payments: exactly one lands, one 409s, no double-booking", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);

    // Both treasurers click "Pay $75" on a $75 balance. Without the balance check in the
    // WHERE clause, both would decrement and both would mint a row: $150 of income
    // against −$75 owed — the books agreeing with each other and both being wrong.
    const results = await Promise.allSettled([
      recordDuesPayment(ctxFor(org.id, member.id), { brotherId: member.id, amount: 75, date: "2026-07-14" }),
      recordDuesPayment(ctxFor(org.id, member.id), { brotherId: member.id, amount: 75, date: "2026-07-14" }),
    ]);
    void ctx;

    const ok = results.filter(r => r.status === "fulfilled");
    const no = results.filter(r => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(no).toHaveLength(1);

    // Exactly one row of income, and the balance is zero — not negative.
    expect(await duesRows(org.id)).toHaveLength(1);
    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(0);
  });
});

describe("adjustDues — a receivable, not cash", () => {
  it("charging dues moves the balance and writes NO ledger row", async () => {
    const { org, member, ctx } = await chapterWithDebtor(0);

    const res = await adjustDues(ctx, { brotherId: member.id, delta: 150, reason: "Spring dues" });
    expect(res.duesOwed).toBe(150);

    // The whole point: an assessment is money OWED, not money RECEIVED. Booking it as
    // income would inflate the treasury with cash the chapter doesn't have.
    expect(await duesRows(org.id)).toHaveLength(0);
  });

  it("waiving dues reduces the balance, still with no ledger row", async () => {
    const { org, member, ctx } = await chapterWithDebtor(150);

    const res = await adjustDues(ctx, { brotherId: member.id, delta: -50, reason: "Hardship waiver" });
    expect(res.duesOwed).toBe(100);
    expect(await duesRows(org.id)).toHaveLength(0);
  });

  it("a waiver cannot drive the balance negative", async () => {
    const { member, ctx } = await chapterWithDebtor(50);

    await expect(
      adjustDues(ctx, { brotherId: member.id, delta: -100, reason: "oops" }),
    ).rejects.toBeInstanceOf(ConflictError);

    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(50);
  });
});

describe("the back doors in transaction-service", () => {
  it("voiding a dues payment gives the member their balance back", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);
    await recordDuesPayment(ctx, { brotherId: member.id, amount: 75, date: "2026-07-14" });
    const [row] = await duesRows(org.id);

    // Deleting the income without restoring the debt is the original bug, reachable
    // through the delete button.
    await softDeleteTransaction(ctx, row.id);

    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(75);
    expect(await duesRows(org.id)).toHaveLength(0);
  });

  it("refuses to re-price or re-bucket a dues payment", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);
    await recordDuesPayment(ctx, { brotherId: member.id, amount: 75, date: "2026-07-14" });
    const [row] = await duesRows(org.id);

    // Changing the amount would leave the roster and the ledger disagreeing by the
    // difference; changing the category would hide the payment from every dues total
    // while the member stays credited.
    await expect(updateTransaction(ctx, row.id, { amount: 20 })).rejects.toBeInstanceOf(ConflictError);
    await expect(updateTransaction(ctx, row.id, { category: "Social" })).rejects.toBeInstanceOf(ConflictError);

    // A harmless edit — one that can't desync the two books — still goes through.
    await updateTransaction(ctx, row.id, { description: "Dues payment — corrected note" });
    const edited = await testPrisma.transaction.findUnique({ where: { id: row.id } });
    expect(edited?.description).toBe("Dues payment — corrected note");
    expect(edited?.amount).toBe(75);
  });

  it("voiding an ordinary (non-dues) transaction still works and touches no balance", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);
    const tx = await testPrisma.transaction.create({
      data: { organizationId: org.id, type: "expense", category: "Social", amount: 40, date: "2026-07-01", description: "Pizza" },
    });

    await softDeleteTransaction(ctx, tx.id);

    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(75);
    const row = await testPrisma.transaction.findUnique({ where: { id: tx.id } });
    expect(row?.deletedAt).not.toBeNull();
  });
});

describe("reconciliation", () => {
  it("reports roster-owed against ledger-collected", async () => {
    const { org, member, ctx } = await chapterWithDebtor(100);
    await recordDuesPayment(ctx, { brotherId: member.id, amount: 40, date: "2026-07-14" });

    const rec = await getDuesReconciliation(ctx);
    expect(rec.rosterOutstanding).toBe(60);
    expect(rec.ledgerCollected).toBe(40);
    expect(rec.members.find(m => m.id === member.id)).toMatchObject({ owed: 60, paid: 40 });
    void org;
  });

  it("surfaces pre-migration dues rows as unattributed rather than guessing at them", async () => {
    const { org, ctx } = await chapterWithDebtor(0);
    // A historical payment: real money, no brotherId — nobody can say who paid it.
    await testPrisma.transaction.create({
      data: { organizationId: org.id, type: "income", category: "Dues", amount: 75, date: "2026-01-10", description: "Dues" },
    });

    const rec = await getDuesReconciliation(ctx);
    expect(rec.unattributed).toHaveLength(1);
    expect(rec.unattributedTotal).toBe(75);
    // It must NOT be silently folded into anyone's paid total.
    expect(rec.ledgerCollected).toBe(0);
  });

  it("attributing a historical row links it WITHOUT moving the balance", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);
    const orphan = await testPrisma.transaction.create({
      data: { organizationId: org.id, type: "income", category: "Dues", amount: 75, date: "2026-01-10", description: "Dues" },
    });

    await attributeDuesPayment(ctx, { transactionId: orphan.id, brotherId: member.id });

    // The balance was already hand-adjusted back when the row was written (that was the
    // old workflow) — decrementing it again here would double-count the payment.
    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(75);

    const rec = await getDuesReconciliation(ctx);
    expect(rec.unattributed).toHaveLength(0);
    expect(rec.ledgerCollected).toBe(75);
  });
});

describe("authorization + tenancy", () => {
  it("a member with neither treasury nor roster authority cannot record a payment", async () => {
    const { member, org } = await chapterWithDebtor(75);
    const powerless = ctxFor(org.id, member.id, { permissions: 0 });

    await expect(
      recordDuesPayment(powerless, { brotherId: member.id, amount: 75, date: "2026-07-14" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("MANAGE_BROTHERS alone is enough — the roster admin is not locked out", async () => {
    const { member, org } = await chapterWithDebtor(75);
    // The old code gated the endpoint on MANAGE_BROTHERS while the treasury UI gated its
    // button on MANAGE_TREASURY. Both must work now.
    const rosterAdmin = ctxFor(org.id, member.id, { permissions: PERMISSIONS.MANAGE_BROTHERS });

    const res = await recordDuesPayment(rosterAdmin, { brotherId: member.id, amount: 75, date: "2026-07-14" });
    expect(res.duesOwed).toBe(0);
  });

  it("cannot pay dues for a brother in another org", async () => {
    const alpha = await createOrg("Alpha", "alpha");
    const beta  = await createOrg("Beta", "beta");
    const outsider = await createBrother({ orgId: beta.id, name: "Outsider", duesOwed: 75 });
    const ctx = ctxFor(alpha.id, 1);

    await expect(
      recordDuesPayment(ctx, { brotherId: outsider.id, amount: 75, date: "2026-07-14" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // And their balance is untouched.
    const after = await testPrisma.brother.findUnique({ where: { id: outsider.id } });
    expect(after?.duesOwed).toBe(75);
    expect(await duesRows(alpha.id)).toHaveLength(0);
    expect(await duesRows(beta.id)).toHaveLength(0);
  });
});
