/**
 * Receipt against a real database: its totals are summed from the ledger lines
 * it shows, so for the same filter they must equal sum_transactions. Also the
 * pieces only a real query exercises: soft-deleted lines stay out, a pending
 * reimbursement or a scheduled line reads as pending, and the transaction
 * peek card answers for the ref the receipt rows carry.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg } from "../setup/factories";
import { db } from "@/lib/db";
import { runTool } from "@/lib/ai-tools";
import { buildShape, createShapeEvidence } from "@/lib/ai-shapes";
import { getPeek } from "@/lib/services/peek-service";
import type { RequestContext } from "@/lib/context";
import type { ReceiptShape } from "@/lib/api-types";

let prevFlag: string | undefined;
beforeAll(() => { prevFlag = process.env.ASK_CHAPT_FORMS; process.env.ASK_CHAPT_FORMS = "1"; });
afterAll(() => { if (prevFlag === undefined) delete process.env.ASK_CHAPT_FORMS; else process.env.ASK_CHAPT_FORMS = prevFlag; });
beforeEach(async () => { await resetDb(); });

async function line(orgId: number, over: { type: "income" | "expense"; amount: number; date: string; category?: string; description: string; status?: string; deleted?: boolean }) {
  return testPrisma.transaction.create({
    data: {
      organizationId: orgId, type: over.type, category: over.category ?? "formal", amount: over.amount,
      amountCents: BigInt(Math.round(over.amount * 100)), date: over.date, description: over.description,
      status: over.status ?? "posted", ...(over.deleted ? { deletedAt: new Date() } : {}),
    },
  });
}

describe("receipt", () => {
  it("totals equal sum_transactions for the same filter", async () => {
    const org = await createOrg("Receipt Org", "receipt-org");
    await line(org.id, { type: "expense", amount: 500, date: "2026-10-21", description: "Venue hold" });
    await line(org.id, { type: "expense", amount: 186.4, date: "2026-11-02", description: "Decorations" });
    await line(org.id, { type: "income", amount: 775, date: "2026-11-05", description: "Ticket sales, week 1" });
    await line(org.id, { type: "expense", amount: 92, date: "2026-11-06", description: "Invite printing", status: "scheduled" });
    await line(org.id, { type: "expense", amount: 999, date: "2026-11-07", description: "Deleted", deleted: true });
    await line(org.id, { type: "expense", amount: 40, date: "2026-11-07", category: "ops", description: "Other category" });

    const scoped = db(org.id);
    const filter = { category: "formal" };
    const ev = createShapeEvidence();
    ev.add("list_transactions", filter, await runTool("list_transactions", filter, scoped, org.id));
    const sum = await runTool("sum_transactions", filter, scoped, org.id) as { totals?: { income: number; expense: number }; income?: number; expense?: number };
    const built = (await buildShape({ type: "receipt" }, ev, scoped, org.id))!;
    const shape = built.shape as ReceiptShape;

    const income = sum.totals?.income ?? sum.income!;
    const expense = sum.totals?.expense ?? sum.expense!;
    expect(shape.totals).toEqual({ out: Math.round(expense * 100), in: Math.round(income * 100), net: Math.round((income - expense) * 100) });
    expect(shape.headline).toBe("net");
    expect(shape.items.map(i => i.cents)).toEqual([-50000, -18640, 77500, -9200]);
    expect(shape.items.map(i => i.pending)).toEqual([false, false, false, true]);
    expect(built.rows.every(r => r.ref?.type === "transaction")).toBe(true);

    const card = await getPeek({ db: scoped, orgId: org.id } as unknown as RequestContext, "transaction", built.rows[0].ref!.id);
    expect(card).toMatchObject({ type: "transaction", title: "Venue hold" });
    expect(card.facts[0]).toMatchObject({ k: "Paid out", v: "− $500" });
  });
});
