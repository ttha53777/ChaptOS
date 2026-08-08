/**
 * Per-org income/expense category tests.
 *
 * What's under test is that an org owns its own money vocabulary — it can add,
 * rename, hide and delete streams — WITHOUT being able to break the two things the
 * server writes by name (income/"Dues", expense/"Reimbursement") or orphan rows
 * that are already filed under a category.
 *
 * The slug rule is the load-bearing one: a slug is derived once from the label and
 * then immutable, so renaming a category is a one-row label update and never a
 * migration over live money. The "rename Dues, slug stays Dues" case pins that.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import {
  createTransactionCategory,
  deleteTransactionCategory,
  listTransactionCategories,
  updateTransactionCategory,
} from "@/lib/services/transaction-category-service";
import { createTransaction } from "@/lib/services/transaction-service";
import { PERMISSIONS } from "@/lib/permissions";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
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

async function chapter(slug = "alpha") {
  const org = await createOrg("Alpha", slug);
  await createSemester({ orgId: org.id, label: "SP26", isActive: true });
  const member = await createBrother({ orgId: org.id, name: "Noah Kim" });
  return { org, member, ctx: ctxFor(org.id, member.id) };
}

const find = <T extends { kind: string; slug: string }>(rows: T[], kind: string, slug: string) =>
  rows.find(r => r.kind === kind && r.slug === slug);

describe("createTransactionCategory", () => {
  it("derives a kebab slug from the label and stores the label verbatim", async () => {
    const { ctx } = await chapter();
    const created = await createTransactionCategory(ctx, { kind: "expense", label: "League Fees!" });

    expect(created.slug).toBe("league-fees");
    expect(created.label).toBe("League Fees!");
    expect(created.builtin).toBe(false);
  });

  it("de-dupes a colliding slug rather than failing", async () => {
    const { ctx } = await chapter();
    await createTransactionCategory(ctx, { kind: "expense", label: "Team Merch" });
    const second = await createTransactionCategory(ctx, { kind: "expense", label: "team merch!!" });

    expect(second.slug).toBe("team-merch-2");
  });

  it("allows the same label on BOTH sides of the ledger", async () => {
    // The payoff of putting `kind` in the unique key: an org sells merch AND buys it.
    const { ctx } = await chapter();
    const income  = await createTransactionCategory(ctx, { kind: "income",  label: "Merch" });
    const expense = await createTransactionCategory(ctx, { kind: "expense", label: "Merch" });

    expect(income.slug).toBe("merch");
    expect(expense.slug).toBe("merch");
    expect(income.id).not.toBe(expense.id);
  });

  it("rejects a duplicate label within one book, case-insensitively", async () => {
    const { ctx } = await chapter();
    await createTransactionCategory(ctx, { kind: "expense", label: "Rush" });

    await expect(createTransactionCategory(ctx, { kind: "expense", label: "rush" }))
      .rejects.toThrow(ValidationError);
  });

  it("requires MANAGE_TREASURY — not org-admin", async () => {
    const { org, member } = await chapter();
    const plain = ctxFor(org.id, member.id, { permissions: 0 });

    await expect(createTransactionCategory(plain, { kind: "expense", label: "Rush" }))
      .rejects.toThrow(ForbiddenError);

    // The permission bit alone is enough; no admin flag needed.
    const treasurer = ctxFor(org.id, member.id, { permissions: PERMISSIONS.MANAGE_TREASURY, isOrgAdmin: false });
    await expect(createTransactionCategory(treasurer, { kind: "expense", label: "Rush" })).resolves.toBeTruthy();
  });
});

describe("reserved categories", () => {
  it("renames the Dues LABEL while the stored slug stays 'Dues'", async () => {
    // The whole dues↔ledger invariant matches on the literal "Dues", so an org that
    // calls dues "Contributions" must change only what's displayed.
    const { ctx } = await chapter();
    const dues = find(await listTransactionCategories(ctx), "income", "Dues")!;

    const renamed = await updateTransactionCategory(ctx, dues.id, { label: "Contributions" });

    expect(renamed.label).toBe("Contributions");
    expect(renamed.slug).toBe("Dues");
  });

  it("refuses to delete or hide Dues", async () => {
    const { ctx } = await chapter();
    const dues = find(await listTransactionCategories(ctx), "income", "Dues")!;

    await expect(deleteTransactionCategory(ctx, dues.id)).rejects.toThrow(ValidationError);
    await expect(updateTransactionCategory(ctx, dues.id, { hidden: true })).rejects.toThrow(ValidationError);
  });

  it("seeds the Reimbursement fallback bucket as reserved", async () => {
    const { ctx } = await chapter();
    const fallback = find(await listTransactionCategories(ctx), "expense", "Reimbursement")!;

    expect(fallback.builtin).toBe(true);
    await expect(deleteTransactionCategory(ctx, fallback.id)).rejects.toThrow(ValidationError);
  });
});

describe("deleteTransactionCategory", () => {
  it("refuses when a live transaction is filed under it", async () => {
    const { ctx } = await chapter();
    const cat = await createTransactionCategory(ctx, { kind: "expense", label: "Rush" });

    await createTransaction(ctx, {
      type: "expense", category: "rush", amount: 40, date: "2026-02-01",
      description: "Flyers", status: "posted", calendarEventIds: [],
    });

    await expect(deleteTransactionCategory(ctx, cat.id)).rejects.toThrow(/used by 1 transaction/);
  });

  it("refuses when a reimbursement or budget line references it", async () => {
    const { org, member, ctx } = await chapter();
    const cat = await createTransactionCategory(ctx, { kind: "expense", label: "Rush" });

    await testPrisma.reimbursement.create({
      data: {
        organizationId: org.id, brotherId: member.id, amount: 20,
        date: "2026-02-01", description: "Flyers", category: "rush",
      },
    });
    await expect(deleteTransactionCategory(ctx, cat.id)).rejects.toThrow(/reimbursement/);
  });

  it("allows deleting an unused category, and hiding is the escape hatch for a used one", async () => {
    const { ctx } = await chapter();
    const unused = await createTransactionCategory(ctx, { kind: "expense", label: "Rush" });
    await expect(deleteTransactionCategory(ctx, unused.id)).resolves.toBeUndefined();

    const used = await createTransactionCategory(ctx, { kind: "expense", label: "Formal" });
    await createTransaction(ctx, {
      type: "expense", category: "formal", amount: 900, date: "2026-02-01",
      description: "Venue", status: "posted", calendarEventIds: [],
    });
    await expect(deleteTransactionCategory(ctx, used.id)).rejects.toThrow(ValidationError);
    await expect(updateTransactionCategory(ctx, used.id, { hidden: true })).resolves.toMatchObject({ hidden: true });
  });

  it("ignores a soft-deleted transaction — voided rows are terminal history", async () => {
    const { org, ctx } = await chapter();
    const cat = await createTransactionCategory(ctx, { kind: "expense", label: "Rush" });
    await testPrisma.transaction.create({
      data: {
        organizationId: org.id, type: "expense", category: "rush", amount: 10,
        date: "2026-02-01", description: "Old", deletedAt: new Date(),
      },
    });

    await expect(deleteTransactionCategory(ctx, cat.id)).resolves.toBeUndefined();
  });
});

describe("tenancy", () => {
  it("keeps one org's categories invisible and untouchable from another", async () => {
    const a = await chapter("alpha");
    const b = await chapter("beta");

    const mine = await createTransactionCategory(a.ctx, { kind: "expense", label: "Rush" });

    const theirs = await listTransactionCategories(b.ctx);
    expect(find(theirs, "expense", "rush")).toBeUndefined();

    await expect(updateTransactionCategory(b.ctx, mine.id, { label: "Stolen" })).rejects.toThrow(NotFoundError);
    await expect(deleteTransactionCategory(b.ctx, mine.id)).rejects.toThrow(NotFoundError);
  });
});
