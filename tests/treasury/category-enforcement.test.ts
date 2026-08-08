/**
 * The write-path gate: every financial write validates its category against the
 * org's own list.
 *
 * Before this, `POST /api/transactions` accepted any string at all — the only
 * check anywhere was budget-service's, against a platform-wide constant. So these
 * tests cover behavior that had no coverage before, including the two subtleties
 * that are easy to regress:
 *
 *   - kind is checked, not just existence. Filing income under an expense category
 *     is the mistake a treasurer actually makes.
 *   - the dues guard still wins. Re-bucketing a dues payment reports why THAT is
 *     refused, not the generic "unknown category".
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import { createTransaction, updateTransaction } from "@/lib/services/transaction-service";
import { createReimbursement, updateReimbursement } from "@/lib/services/reimbursement-service";
import { upsertBudget } from "@/lib/services/budget-service";
import { createTransactionCategory, listTransactionCategories, updateTransactionCategory } from "@/lib/services/transaction-category-service";
import { PERMISSIONS } from "@/lib/permissions";
import { ConflictError, ValidationError } from "@/lib/errors";
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
    permissions:     PERMISSIONS.MANAGE_TREASURY,
    maxRank:         0,
    isOrgAdmin:      false,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

async function chapter(slug = "alpha", owed = 0) {
  const org = await createOrg("Alpha", slug);
  await createSemester({ orgId: org.id, label: "SP26", isActive: true });
  const member = await createBrother({ orgId: org.id, name: "Noah Kim", duesOwed: owed });
  return { org, member, ctx: ctxFor(org.id, member.id) };
}

const tx = (over: Record<string, unknown> = {}) => ({
  type: "expense" as const, category: "Misc", amount: 25, date: "2026-02-01",
  description: "Snacks", status: "posted" as const, calendarEventIds: [], ...over,
});

describe("createTransaction", () => {
  it("accepts a category the org defined", async () => {
    const { ctx } = await chapter();
    await createTransactionCategory(ctx, { kind: "expense", label: "Rush" });

    await expect(createTransaction(ctx, tx({ category: "rush" }))).resolves.toBeTruthy();
  });

  it("rejects a category the org does not have", async () => {
    const { ctx } = await chapter();
    await expect(createTransaction(ctx, tx({ category: "Yacht" }))).rejects.toThrow(ValidationError);
  });

  it("rejects a real category filed on the wrong side of the ledger", async () => {
    const { ctx } = await chapter();
    // "Party Supplies" exists — as an EXPENSE. Filing income under it is the error.
    await expect(createTransaction(ctx, tx({ type: "income", category: "Party Supplies" })))
      .rejects.toThrow(/Not one of this org's income categories/);
  });

  it("still records a dues payment on an org that renamed its Dues label", async () => {
    // Reserved slugs are what the server writes; a relabel must not break them.
    const { org, member, ctx } = await chapter("alpha", 100);
    const dues = (await listTransactionCategories(ctx)).find(c => c.kind === "income" && c.slug === "Dues")!;
    await updateTransactionCategory(ctx, dues.id, { label: "Contributions" });

    await createTransaction(ctx, tx({ type: "income", category: "Dues", amount: 40, brotherId: member.id }));

    const roster = await testPrisma.membership.findFirst({ where: { organizationId: org.id, brotherId: member.id } });
    expect(roster!.duesOwed).toBe(60);
  });

  it("accepts a HIDDEN category — hiding is a picker hint, not a write rule", async () => {
    const { ctx } = await chapter();
    const cat = await createTransactionCategory(ctx, { kind: "expense", label: "Rush" });
    await updateTransactionCategory(ctx, cat.id, { hidden: true });

    await expect(createTransaction(ctx, tx({ category: "rush" }))).resolves.toBeTruthy();
  });
});

describe("updateTransaction", () => {
  it("re-validates when only the TYPE flips", async () => {
    // The category string didn't change, but it's now on the wrong side.
    const { ctx } = await chapter();
    const row = await createTransaction(ctx, tx({ type: "expense", category: "Party Supplies" }));

    await expect(updateTransaction(ctx, (row as unknown as { id: number }).id, { type: "income" }))
      .rejects.toThrow(ValidationError);
  });

  it("lets the dues guard answer first when re-bucketing a dues payment", async () => {
    // Ordering regression pin: "Social" is not a category here, so validating before
    // the dues guard would swap this specific ConflictError for a generic one.
    const { member, ctx } = await chapter("alpha", 100);
    const row = await createTransaction(ctx, tx({ type: "income", category: "Dues", amount: 40, brotherId: member.id }));

    await expect(updateTransaction(ctx, (row as unknown as { id: number }).id, { category: "Social" }))
      .rejects.toThrow(ConflictError);
  });
});

describe("reimbursements", () => {
  it("rejects an unknown category at file time", async () => {
    const { member, ctx } = await chapter();
    await expect(createReimbursement(ctx, {
      brotherId: member.id, amount: 30, date: "2026-02-01", description: "Cups", category: "Yacht",
    })).rejects.toThrow(ValidationError);
  });

  it("approves an uncategorized request into the reserved fallback bucket", async () => {
    // The fallback is a real seeded row, so approving never 400s on its own default.
    const { org, member, ctx } = await chapter();
    const r = await createReimbursement(ctx, {
      brotherId: member.id, amount: 30, date: "2026-02-01", description: "Cups",
    });

    await updateReimbursement(ctx, r.id, { status: "approved" });

    const ledger = await testPrisma.transaction.findFirst({
      where: { organizationId: org.id, type: "expense", deletedAt: null },
    });
    expect(ledger!.category).toBe("Reimbursement");
  });
});

describe("upsertBudget", () => {
  it("accepts an org-defined category that no other org has", async () => {
    // The behavior change: budget allocations used to be checked against a
    // platform-wide constant, so a chapter could not budget for its own "Rush".
    const { ctx } = await chapter();
    await createTransactionCategory(ctx, { kind: "expense", label: "Rush" });

    await expect(upsertBudget(ctx, {
      semester: "SP26", carryoverBalance: 1000, reserveAmount: 0,
      allocations: [{ category: "rush", percent: 100 }],
    })).resolves.toBeTruthy();
  });

  it("rejects an unknown category, and one belonging to a different org", async () => {
    const a = await chapter("alpha");
    const b = await chapter("beta");
    await createTransactionCategory(b.ctx, { kind: "expense", label: "Regalia" });

    await expect(upsertBudget(a.ctx, {
      semester: "SP26", carryoverBalance: 1000, reserveAmount: 0,
      allocations: [{ category: "regalia", percent: 100 }],
    })).rejects.toThrow(ValidationError);
  });

  it("still rejects percents that do not sum to 100", async () => {
    const { ctx } = await chapter();
    await expect(upsertBudget(ctx, {
      semester: "SP26", carryoverBalance: 1000, reserveAmount: 0,
      allocations: [{ category: "Misc", percent: 60 }],
    })).rejects.toThrow(/sum to 100/);
  });
});
