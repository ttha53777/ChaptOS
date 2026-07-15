/**
 * Dues invariant tests.
 *
 * The invariant under test: a dues payment moves BOTH books or neither. Brother.duesOwed
 * and the Transaction ledger used to be maintained independently — the roster could say
 * every member was square while the ledger said the chapter had collected nothing, and
 * both numbers were shown to users as fact. Recording a payment now goes through the
 * ordinary transaction path: createTransaction, when the row is a "Dues" income row with
 * a brotherId, mints the ledger row and decrements the balance in ONE DB transaction. The
 * mirror (softDeleteTransaction re-incrementing on void) and the receivable path
 * (adjustDues, which writes no ledger row) live here too.
 *
 * The concurrency test is the load-bearing one: a bare `{ decrement }` would fix the lost
 * update but still let two racing payments book double the income against a negative
 * balance. The balance predicate lives in the decrement's WHERE clause precisely so that
 * cannot happen.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import {
  adjustDues,
  attributeDuesPayment,
  getDuesReconciliation,
} from "@/lib/services/dues-service";
import {
  createTransaction,
  softDeleteTransaction,
  updateTransaction,
} from "@/lib/services/transaction-service";
import type { CreateTransactionInput } from "@/lib/validation/transaction";
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

/**
 * Record a dues payment the way the UI does: post a "Dues" income transaction attributed
 * to the member. The route parses defaults (status, calendarEventIds); we supply them here
 * since we call the service directly.
 */
function recordPayment(
  ctx: RequestContext,
  input: { brotherId: number; amount: number; date: string; description?: string },
) {
  const data: CreateTransactionInput = {
    type:             "income",
    category:         "Dues",
    brotherId:        input.brotherId,
    amount:           input.amount,
    date:             input.date,
    description:      input.description ?? "Dues payment — Noah Kim",
    status:           "posted",
    calendarEventIds: [],
  };
  return createTransaction(ctx, data);
}

describe("recordPayment (createTransaction, dues) — moves both books at once", () => {
  it("mints the ledger row AND decrements the balance", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);

    const tx = await recordPayment(ctx, { brotherId: member.id, amount: 75, date: "2026-07-14" }) as unknown as { id: number; brotherId: number | null };
    expect(tx.brotherId).toBe(member.id);

    // Roster side.
    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(0);

    // Ledger side — the half that never used to happen.
    const rows = await duesRows(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("income");
    expect(rows[0].amount).toBe(75);
    expect(rows[0].brotherId).toBe(member.id);   // attributable — reconciliation depends on it
    expect(rows[0].status).toBe("posted");
    expect(rows[0].date).toBe("2026-07-14");
    expect(rows[0].id).toBe(tx.id);
  });

  it("stamps the semester LABEL and id, so budget spend can see the row", async () => {
    const { org, member, ctx } = await chapterWithDebtor();
    await recordPayment(ctx, { brotherId: member.id, amount: 75, date: "2026-07-14" });

    const [row] = await duesRows(org.id);
    // Budget matches on the label, not semesterId — a row missing it is invisible there.
    expect(row.semester).toBe("SP26");
    expect(row.semesterId).not.toBeNull();
  });

  it("stores the caller's description verbatim", async () => {
    const { org, member, ctx } = await chapterWithDebtor(50);
    await recordPayment(ctx, { brotherId: member.id, amount: 50, date: "2026-07-14", description: "Dues payment — Chapter Name" });
    const [row] = await duesRows(org.id);
    expect(row.description).toBe("Dues payment — Chapter Name");
  });

  it("a partial payment leaves the remainder owing", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);
    await recordPayment(ctx, { brotherId: member.id, amount: 25, date: "2026-07-14" });

    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(50);

    const rows = await duesRows(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(25);
  });

  it("refuses overpayment, and writes NO ledger row when it does", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);

    await expect(
      recordPayment(ctx, { brotherId: member.id, amount: 100, date: "2026-07-14" }),
    ).rejects.toBeInstanceOf(ConflictError);

    // The refusal must be total: no income booked, no balance moved — both writes share
    // one DB transaction, so the income row rolls back with the decrement.
    expect(await duesRows(org.id)).toHaveLength(0);
    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(75);
  });

  it("two concurrent payments against one balance: one lands, one 409s", async () => {
    const { org, member } = await chapterWithDebtor(75);

    // Two treasurers each record a $75 payment against the same $75 balance. Without the
    // balance check in the WHERE clause, both would decrement and both would mint a row:
    // $150 of income against −$75 owed.
    const results = await Promise.allSettled([
      recordPayment(ctxFor(org.id, member.id), { brotherId: member.id, amount: 75, date: "2026-07-14" }),
      recordPayment(ctxFor(org.id, member.id), { brotherId: member.id, amount: 75, date: "2026-07-14" }),
    ]);

    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);

    // Exactly one row of income, and the balance is zero — not negative.
    expect(await duesRows(org.id)).toHaveLength(1);
    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(0);
  });

  it("an unattributed 'Dues' income row (no brotherId) touches no balance", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);

    // Same category/type, but no member attached — this is a general ledger entry, not a
    // payment against anyone's balance.
    await createTransaction(ctx, {
      type: "income", category: "Dues", amount: 75, date: "2026-07-14",
      description: "Bulk dues deposit", status: "posted", calendarEventIds: [],
    });

    const after = await testPrisma.brother.findUnique({ where: { id: member.id } });
    expect(after?.duesOwed).toBe(75);
    const [row] = await duesRows(org.id);
    expect(row.brotherId).toBeNull();
  });

  it("cannot record a payment for a brother in another org (and moves nothing)", async () => {
    const alpha = await createOrg("Alpha", "alpha");
    const beta  = await createOrg("Beta", "beta");
    const outsider = await createBrother({ orgId: beta.id, name: "Outsider", duesOwed: 75 });
    const ctx = ctxFor(alpha.id, 1);

    await expect(
      recordPayment(ctx, { brotherId: outsider.id, amount: 75, date: "2026-07-14" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const after = await testPrisma.brother.findUnique({ where: { id: outsider.id } });
    expect(after?.duesOwed).toBe(75);
    expect(await duesRows(alpha.id)).toHaveLength(0);
    expect(await duesRows(beta.id)).toHaveLength(0);
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

  it("MANAGE_BROTHERS alone is NOT enough — dues are treasury-only now", async () => {
    const { member, org } = await chapterWithDebtor(0);
    const rosterAdmin = ctxFor(org.id, member.id, { permissions: PERMISSIONS.MANAGE_BROTHERS });

    await expect(
      adjustDues(rosterAdmin, { brotherId: member.id, delta: 50, reason: "Spring dues" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const treasurer = ctxFor(org.id, member.id, { permissions: PERMISSIONS.MANAGE_TREASURY });
    const res = await adjustDues(treasurer, { brotherId: member.id, delta: 50, reason: "Spring dues" });
    expect(res.duesOwed).toBe(50);
  });
});

describe("the back doors in transaction-service", () => {
  it("voiding a dues payment gives the member their balance back", async () => {
    const { org, member, ctx } = await chapterWithDebtor(75);
    await recordPayment(ctx, { brotherId: member.id, amount: 75, date: "2026-07-14" });
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
    await recordPayment(ctx, { brotherId: member.id, amount: 75, date: "2026-07-14" });
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
    await recordPayment(ctx, { brotherId: member.id, amount: 40, date: "2026-07-14" });

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

  it("attribution and adjustment are treasury-only", async () => {
    const { org, member } = await chapterWithDebtor(75);
    const rosterAdmin = ctxFor(org.id, member.id, { permissions: PERMISSIONS.MANAGE_BROTHERS });
    const orphan = await testPrisma.transaction.create({
      data: { organizationId: org.id, type: "income", category: "Dues", amount: 75, date: "2026-01-10", description: "Dues" },
    });

    await expect(
      attributeDuesPayment(rosterAdmin, { transactionId: orphan.id, brotherId: member.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
