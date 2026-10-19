/**
 * The Dues tab's reads: getDuesBoard and getMemberDuesBook, over real rows.
 *
 * lib/dues-ledger.ts is pinned on its own (dues-ledger.test.ts); these check
 * what the DB half decides around it — which rows count (voided, other orgs,
 * payments before the cutover), which charges a term's view shows, and that
 * the reconciliation's drift column agrees with the stored balance.
 *
 * Charges are seeded raw here: handing them out is Phase 2's write path.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createBrother, createOrg, createSemester, joinOrg } from "../setup/factories";
import { db } from "@/lib/db";
import { duesToday } from "@/lib/dues-ledger";
import { getDuesBoard, getMemberDuesBook } from "@/lib/services/dues-charge-service";
import { getDuesReconciliation } from "@/lib/services/dues-service";
import { createTransaction } from "@/lib/services/transaction-service";
import { PERMISSIONS } from "@/lib/permissions";
import { NotFoundError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number, permissions = 0): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions,
    maxRank:         0,
    isOrgAdmin:      false,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

// Dates relative to the org's today (no time zone set → UTC), so the suite
// doesn't rot as the calendar moves.
const TODAY = duesToday(null);
const shift = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function charge(orgId: number, opts: {
  name: string; dueDate?: string | null; semesterId?: number | null; lines: [number, number][];
  kind?: "all" | "role" | "pick" | "single" | "carryover"; voided?: boolean; createdAt?: Date;
}) {
  const c = await testPrisma.duesCharge.create({
    data: {
      organizationId: orgId,
      name:           opts.name,
      dueDate:        opts.dueDate ?? null,
      audienceKind:   opts.kind ?? "all",
      audienceLabel:  "Everyone",
      semesterId:     opts.semesterId ?? null,
      voidedAt:       opts.voided ? new Date() : null,
      createdAt:      opts.createdAt,
    },
  });
  await testPrisma.duesChargeLine.createMany({
    data: opts.lines.map(([brotherId, dollars]) => ({ organizationId: orgId, chargeId: c.id, brotherId, amountCents: Math.round(dollars * 100) })),
  });
  return c;
}

/** Pay the way the UI does: a Dues income row through createTransaction (decrements duesOwed). */
function pay(ctx: RequestContext, brotherId: number, amount: number, date = TODAY) {
  return createTransaction({ ...ctx, permissions: PERMISSIONS.MANAGE_TREASURY }, {
    type: "income", category: "Dues", brotherId, amount, date,
    description: "Dues payment", status: "posted", calendarEventIds: [], paymentMethod: "venmo",
  });
}

/**
 * Fall dues ($140, 10 days overdue) and a photo fee ($20, due in 10 days) on a
 * three-person roster, each starting with duesOwed = what they were billed.
 * Maya pays everything, Leo pays $100, Zane (a new member at $90) pays nothing.
 */
async function midTerm() {
  const org = await createOrg("Oozma Kappa", "ok");
  const fall26 = await createSemester({ orgId: org.id, label: "FA26", isActive: true, startDate: shift(-60), endDate: shift(60) });
  const maya = await createBrother({ orgId: org.id, name: "Maya Rivera", duesOwed: 160 });
  const leo = await createBrother({ orgId: org.id, name: "Leo Park", duesOwed: 160 });
  const zane = await createBrother({ orgId: org.id, name: "Zane Fowler", duesOwed: 110 });
  const fall = await charge(org.id, { name: "Fall dues", dueDate: shift(-10), semesterId: fall26.id, lines: [[maya.id, 140], [leo.id, 140], [zane.id, 90]], createdAt: new Date(Date.now() - 20 * 86_400_000) });
  const photo = await charge(org.id, { name: "Composite photo", dueDate: shift(10), semesterId: fall26.id, lines: [[maya.id, 20], [leo.id, 20], [zane.id, 20]] });
  const ctx = ctxFor(org.id, zane.id);
  await pay(ctx, maya.id, 160);
  await pay(ctx, leo.id, 100);
  return { org, fall26, maya, leo, zane, fall, photo, ctx };
}

describe("getDuesBoard", () => {
  it("is empty before anyone is billed, with every member standing at none", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await createBrother({ orgId: org.id });
    await createBrother({ orgId: org.id });
    const board = await getDuesBoard(ctxFor(org.id, a.id));
    expect(board.charges).toEqual([]);
    expect(board.members).toHaveLength(2);
    expect(board.members.every(m => m.standing === "none")).toBe(true);
    expect(board.totals).toEqual({ billed: 0, paid: 0, owes: 0, overdue: 0 });
    expect(board.viewer?.brotherId).toBe(a.id);
    expect(board.today).toBe(TODAY);
  });

  it("derives standing, charge progress and totals from payments allocated oldest-due first", async () => {
    const { maya, leo, zane, fall, photo, ctx } = await midTerm();
    const board = await getDuesBoard(ctx);

    const by = Object.fromEntries(board.members.map(m => [m.brotherId, m]));
    expect(by[maya.id]).toMatchObject({ standing: "paid", billed: 160, paid: 160, owes: 0, open: [] });
    // Leo's $100 went to Fall dues (oldest due), leaving $40 of it overdue + the photo fee.
    expect(by[leo.id]).toMatchObject({ standing: "overdue", billed: 160, paid: 100, owes: 60, overdue: 40, lateDays: 10, nextChargeId: fall.id });
    expect(by[leo.id].open).toEqual([{ chargeId: fall.id, rest: 40 }, { chargeId: photo.id, rest: 20 }]);
    expect(by[zane.id]).toMatchObject({ standing: "overdue", owes: 110, overdue: 90 });

    // Newest charge first.
    expect(board.charges.map(c => c.id)).toEqual([photo.id, fall.id]);
    const f = board.charges.find(c => c.id === fall.id)!;
    expect(f).toMatchObject({ people: 3, paidPeople: 1, total: 370, outstanding: 130, overdue: true, amounts: [90, 140] });
    const p = board.charges.find(c => c.id === photo.id)!;
    expect(p).toMatchObject({ people: 3, paidPeople: 1, total: 60, outstanding: 40, overdue: false, amounts: [20] });

    expect(board.totals).toEqual({ billed: 430, paid: 260, owes: 170, overdue: 130 });
    expect(board.viewer?.brotherId).toBe(zane.id);
  });

  it("leaves out voided charges, voided lines and voided waivers", async () => {
    const { org, leo, zane, fall, ctx } = await midTerm();
    await charge(org.id, { name: "Taken back", dueDate: shift(-3), lines: [[zane.id, 500]], voided: true });
    await testPrisma.duesChargeLine.updateMany({ where: { chargeId: fall.id, brotherId: zane.id }, data: { voidedAt: new Date() } });
    await testPrisma.duesWaiver.create({ data: { organizationId: org.id, brotherId: leo.id, amountCents: 4000, voidedAt: new Date() } });

    const board = await getDuesBoard(ctx);
    expect(board.charges.map(c => c.name)).not.toContain("Taken back");
    expect(board.charges.find(c => c.id === fall.id)!.people).toBe(2);
    expect(board.members.find(m => m.brotherId === zane.id)!.owes).toBe(20);
    expect(board.members.find(m => m.brotherId === leo.id)!.owes).toBe(60);
  });

  it("applies a live waiver pinned to a charge to that charge first", async () => {
    const { org, leo, photo, ctx } = await midTerm();
    await testPrisma.duesWaiver.create({ data: { organizationId: org.id, brotherId: leo.id, amountCents: 2000, chargeId: photo.id, reason: "Took his own photo" } });
    const leoRow = (await getDuesBoard(ctx)).members.find(m => m.brotherId === leo.id)!;
    expect(leoRow.open).toEqual([{ chargeId: expect.any(Number), rest: 40 }]);
    expect(leoRow.standing).toBe("overdue");
  });

  it("scopes a term's view to its own charges plus unpaid charges filed under no term", async () => {
    const { org, maya, leo, fall26, ctx } = await midTerm();
    const sp26 = await createSemester({ orgId: org.id, label: "SP26", isActive: false, startDate: "2026-01-01", endDate: "2026-05-30" });
    await charge(org.id, { name: "Spring dues", dueDate: "2026-02-01", semesterId: sp26.id, lines: [[leo.id, 120]] });
    const earlier = await charge(org.id, { name: "Earlier balance", kind: "carryover", lines: [[leo.id, 30]] });
    const settled = await charge(org.id, { name: "Old shirt", lines: [[maya.id, 15]], createdAt: new Date("2026-01-01") });
    // Maya's tab: $160 paid against $175 billed, so the shirt (no due date, so last) stays $15 open.
    // Settle it so it reads as paid.
    await testPrisma.duesWaiver.create({ data: { organizationId: org.id, brotherId: maya.id, amountCents: 1500, chargeId: settled.id } });

    const fall = await getDuesBoard(ctx, { semester: "FA26" });
    expect(fall.term).toEqual({ id: fall26.id, label: "FA26" });
    expect(fall.charges.map(c => c.name).sort()).toEqual(["Composite photo", "Earlier balance", "Fall dues"]);

    const spring = await getDuesBoard(ctx, { semester: "SP26" });
    expect(spring.charges.map(c => c.name).sort()).toEqual(["Earlier balance", "Spring dues"]);
    // Maya has nothing in Spring's view.
    expect(spring.members.find(m => m.brotherId === maya.id)!.standing).toBe("none");

    const all = await getDuesBoard(ctx);
    expect(all.term).toBeNull();
    expect(all.charges.map(c => c.id)).toContain(earlier.id);
    expect(all.charges.map(c => c.id)).toContain(settled.id);

    await expect(getDuesBoard(ctx, { semester: "NOPE" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("only counts payments made after the org's cutover", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await createBrother({ orgId: org.id, duesOwed: 50 });
    const ctx = ctxFor(org.id, a.id);
    await pay(ctx, a.id, 50); // before the cutover: already netted into the carryover
    await testPrisma.organizationConfig.create({ data: { organizationId: org.id, duesLedgerStartedAt: new Date() } });
    await testPrisma.membership.updateMany({ where: { brotherId: a.id }, data: { duesOwed: 80 } });
    await charge(org.id, { name: "Earlier balance", kind: "carryover", lines: [[a.id, 80]] });

    const board = await getDuesBoard(ctx);
    expect(board.members[0]).toMatchObject({ standing: "due", billed: 80, paid: 0, owes: 80 });

    await pay(ctx, a.id, 30);
    expect((await getDuesBoard(ctx)).members[0]).toMatchObject({ paid: 30, owes: 50 });
  });

  it("keeps an archived member while they still have a line in view, and drops them otherwise", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await createBrother({ orgId: org.id });
    const gone = await createBrother({ orgId: org.id, archivedAt: new Date(), duesOwed: 40 });
    const goneClean = await createBrother({ orgId: org.id, archivedAt: new Date() });
    await charge(org.id, { name: "Fall dues", dueDate: shift(5), lines: [[gone.id, 40]] });

    const ids = (await getDuesBoard(ctxFor(org.id, a.id))).members.map(m => m.brotherId);
    expect(ids).toContain(gone.id);
    expect(ids).not.toContain(goneClean.id);
  });

  it("never shows another org's charges, lines or payments", async () => {
    const { ctx, maya } = await midTerm();
    const other = await createOrg("Beta", "beta");
    // The same person, also a member of Beta, owing there.
    await joinOrg({ brotherId: maya.id, orgId: other.id, duesOwed: 999 });
    await charge(other.id, { name: "Beta dues", dueDate: shift(-30), lines: [[maya.id, 999]] });

    const board = await getDuesBoard(ctx);
    expect(board.charges.map(c => c.name)).not.toContain("Beta dues");
    expect(board.members.find(m => m.brotherId === maya.id)).toMatchObject({ standing: "paid", owes: 0 });

    const beta = await getDuesBoard(ctxFor(other.id, maya.id));
    expect(beta.charges.map(c => c.name)).toEqual(["Beta dues"]);
    expect(beta.members.find(m => m.brotherId === maya.id)).toMatchObject({ standing: "overdue", owes: 999, paid: 0 });
  });
});

describe("getMemberDuesBook", () => {
  it("lists charges, payments and waivers in date order, with what's still open", async () => {
    const { org, leo, fall, photo, ctx } = await midTerm();
    const w = await testPrisma.duesWaiver.create({ data: { organizationId: org.id, brotherId: leo.id, amountCents: 1000, reason: "Hardship" } });

    const book = await getMemberDuesBook(ctx, leo.id);
    expect(book.entries.map(e => [e.kind, e.title, e.amount])).toEqual([
      ["charge", "Fall dues", 140],
      ["charge", "Composite photo", 20],
      ["payment", "Paid", -100],
      ["waiver", "Waived", -10],
    ]);
    expect(book.entries[0].detail).toMatch(/^Due [A-Z][a-z]{2} \d{1,2}$/);
    expect(book.entries[2]).toMatchObject({ detail: "venmo", chargeId: null });
    expect(book.entries[3]).toMatchObject({ detail: "Hardship", refId: w.id });
    expect(book.standing).toMatchObject({ owes: 50, overdue: 30 });
    expect(book.open).toEqual([
      { chargeId: fall.id, name: "Fall dues", dueDate: fall.dueDate, rest: 30 },
      { chargeId: photo.id, name: "Composite photo", dueDate: photo.dueDate, rest: 20 },
    ]);
  });

  it("is empty for a member who was never billed", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await createBrother({ orgId: org.id });
    const book = await getMemberDuesBook(ctxFor(org.id, a.id), a.id);
    expect(book).toMatchObject({ entries: [], open: [], standing: { standing: "none", owes: 0 } });
  });

  it("refuses a member of another org", async () => {
    const { ctx } = await midTerm();
    const other = await createOrg("Beta", "beta");
    const stranger = await createBrother({ orgId: other.id });
    await expect(getMemberDuesBook(ctx, stranger.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getDuesReconciliation drift", () => {
  it("is zero when the stored balance matches the charges", async () => {
    const { ctx } = await midTerm();
    const r = await getDuesReconciliation({ ...ctx, permissions: PERMISSIONS.MANAGE_TREASURY });
    expect(r.driftCount).toBe(0);
    expect(r.members.every(m => m.drift === 0 && m.chargedOwed === m.owed)).toBe(true);
  });

  it("flags a balance the charges don't explain", async () => {
    const { ctx, zane } = await midTerm();
    await testPrisma.membership.updateMany({ where: { brotherId: zane.id }, data: { duesOwed: 135 } });
    const r = await getDuesReconciliation({ ...ctx, permissions: PERMISSIONS.MANAGE_TREASURY });
    expect(r.driftCount).toBe(1);
    expect(r.members.find(m => m.id === zane.id)).toMatchObject({ owed: 135, chargedOwed: 110, drift: 25 });
  });
});
