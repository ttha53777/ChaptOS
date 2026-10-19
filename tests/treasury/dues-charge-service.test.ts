/**
 * Dues charges: handing out, changing, taking back, waiving.
 *
 * The invariant every test ends on: for each roster row,
 *
 *   duesOwed = Σ live lines − Σ dues payments since cutover − Σ live waivers
 *
 * checked through getDuesReconciliation's drift column (zero drift, and no
 * credit the charges can't place). A write that moves the stored balance
 * without the matching row — or the row without the balance — fails it.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { testPrisma, resetDb } from "../setup/prisma";
import { createBrother, createOrg, createSemester, joinOrg, rosterOf } from "../setup/factories";
import { db } from "@/lib/db";
import {
  getDuesBoard, getMemberDuesBook, issueDuesCharge, previewDuesCharge, updateDuesCharge,
  voidDuesCharge, voidDuesChargeLine, voidDuesWaiver, waiveDues,
} from "@/lib/services/dues-charge-service";
import { adjustDues, getDuesReconciliation } from "@/lib/services/dues-service";
import { createTransaction, softDeleteTransaction, updateTransaction } from "@/lib/services/transaction-service";
import { issueDuesChargeInput, type IssueDuesChargeInput } from "@/lib/validation/dues";
import { PERMISSIONS } from "@/lib/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number, permissions: number = PERMISSIONS.MANAGE_TREASURY): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Dev", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions, maxRank: 0, isOrgAdmin: false, isPlatformAdmin: false, db: db(orgId),
  };
}

/** Parse like the route does, so defaults (onDuplicate, exclude) apply. */
type SpecInput = z.input<typeof issueDuesChargeInput>;
const spec = (v: SpecInput) => issueDuesChargeInput.parse(v);

const everyone = (name: string, amount: number, extra: Partial<SpecInput> = {}): IssueDuesChargeInput =>
  spec({ name, dueDate: "2026-11-01", audience: { kind: "all", amount: { mode: "each", amount } }, ...extra });

async function expectBooksAgree(ctx: RequestContext) {
  const r = await getDuesReconciliation({ ...ctx, permissions: PERMISSIONS.MANAGE_TREASURY });
  const off = r.members.filter(m => m.drift !== 0);
  expect(off, `drift: ${JSON.stringify(off)}`).toEqual([]);
}

const owed = async (brotherId: number, orgId?: number) => (await rosterOf(brotherId, orgId))?.duesOwed;
const ledgerRows = (orgId: number) => testPrisma.transaction.count({ where: { organizationId: orgId } });
const events = (orgId: number, action: string) => testPrisma.operationalEvent.findMany({ where: { organizationId: orgId, action } });

function pay(ctx: RequestContext, brotherId: number, amount: number) {
  return createTransaction(ctx, {
    type: "income", category: "Dues", brotherId, amount, date: "2026-10-19",
    description: "Dues payment", status: "posted", calendarEventIds: [], paymentMethod: "venmo",
  }) as unknown as Promise<{ id: number }>;
}

/** An active term, a treasurer (Dev: Treasurer + Social chair), Jordan (Social chair), and two plain members. */
async function chapter() {
  const org = await createOrg("Oozma Kappa", "ok");
  const term = await createSemester({ orgId: org.id, label: "FA26", isActive: true, startDate: "2026-08-15", endDate: "2026-12-15" });
  const dev = await createBrother({ orgId: org.id, name: "Dev Okafor" });
  const jordan = await createBrother({ orgId: org.id, name: "Jordan Tao" });
  const maya = await createBrother({ orgId: org.id, name: "Maya Rivera" });
  const leo = await createBrother({ orgId: org.id, name: "Leo Park" });
  const treasurer = await testPrisma.role.create({ data: { organizationId: org.id, name: "Treasurer" } });
  const social = await testPrisma.role.create({ data: { organizationId: org.id, name: "Social chair" } });
  await testPrisma.brotherRole.createMany({
    data: [
      { brotherId: dev.id, roleId: treasurer.id, organizationId: org.id },
      { brotherId: dev.id, roleId: social.id, organizationId: org.id },
      { brotherId: jordan.id, roleId: social.id, organizationId: org.id },
    ],
  });
  return { org, term, dev, jordan, maya, leo, treasurer, social, ctx: ctxFor(org.id, dev.id) };
}

describe("issueDuesCharge", () => {
  it("bills everyone, raises each balance, writes no ledger row, and files it under the active term", async () => {
    const { org, term, dev, maya, ctx } = await chapter();
    const res = await issueDuesCharge(ctx, everyone("Fall dues", 140, { note: "Venmo @oozma-kappa" }));

    expect(res).toMatchObject({ name: "Fall dues", people: 4, total: 560, skipped: 0 });
    expect(await owed(maya.id)).toBe(140);
    expect(await owed(dev.id)).toBe(140);
    expect(await ledgerRows(org.id)).toBe(0);

    const c = await testPrisma.duesCharge.findUniqueOrThrow({ where: { id: res.id } });
    expect(c).toMatchObject({ audienceKind: "all", audienceLabel: "Everyone", semesterId: term.id, note: "Venmo @oozma-kappa", createdById: dev.id, dueDate: "2026-11-01" });
    expect(await events(org.id, "dues.charge_issued")).toHaveLength(1);
    await expectBooksAgree(ctx);
  });

  it("leaves out excluded and archived members", async () => {
    const { org, maya, leo, ctx } = await chapter();
    const gone = await createBrother({ orgId: org.id, name: "Ex Member", archivedAt: new Date() });
    const res = await issueDuesCharge(ctx, spec({ name: "Fall dues", dueDate: null, audience: { kind: "all", exclude: [leo.id], amount: { mode: "each", amount: 100 } } }));
    expect(res.people).toBe(3);
    expect(await owed(leo.id)).toBe(0);
    expect(await owed(gone.id)).toBe(0);
    expect(await owed(maya.id)).toBe(100);
    expect((await testPrisma.duesCharge.findUniqueOrThrow({ where: { id: res.id } })).audienceLabel).toBe("Everyone but 1");
    await expectBooksAgree(ctx);
  });

  it("splits a total to the penny", async () => {
    const { dev, jordan, maya, ctx } = await chapter();
    const res = await issueDuesCharge(ctx, spec({ name: "Retreat", dueDate: null, audience: { kind: "pick", brotherIds: [dev.id, jordan.id, maya.id], amount: { mode: "split", total: 100 } } }));
    expect(res.total).toBe(100);
    // Dev, Jordan, Maya in name order: the extra cent goes to Dev.
    expect([await owed(dev.id), await owed(jordan.id), await owed(maya.id)]).toEqual([33.34, 33.33, 33.33]);
    await expectBooksAgree(ctx);
  });

  it("stacks role rates: a Treasurer who is also Social chair pays both", async () => {
    const { org, dev, jordan, maya, leo, treasurer, social, ctx } = await chapter();
    const res = await issueDuesCharge(ctx, spec({
      name: "Officer dues", dueDate: "2026-11-01",
      audience: { kind: "role", rates: [{ key: treasurer.id, amount: 60 }, { key: social.id, amount: 40 }, { key: "none", amount: 140 }] },
    }));
    expect(await owed(dev.id)).toBe(100);
    expect(await owed(jordan.id)).toBe(40);
    expect(await owed(maya.id)).toBe(140);
    expect(await owed(leo.id)).toBe(140);
    expect(res).toMatchObject({ people: 4, total: 420 });

    const c = await testPrisma.duesCharge.findUniqueOrThrow({ where: { id: res.id } });
    expect(c.audienceKind).toBe("role");
    expect(c.audienceLabel).toBe("By role");
    expect(c.rateCard).toEqual([
      { key: treasurer.id, label: "Treasurer", amountCents: 6000 },
      { key: social.id, label: "Social chair", amountCents: 4000 },
      { key: "none", label: "Members with no role", amountCents: 14000 },
    ]);
    void org;
    await expectBooksAgree(ctx);
  });

  it("refuses a role or a person from outside the chapter", async () => {
    const { ctx } = await chapter();
    const other = await createOrg("Beta", "beta");
    const theirRole = await testPrisma.role.create({ data: { organizationId: other.id, name: "Treasurer" } });
    const theirMember = await createBrother({ orgId: other.id });

    await expect(issueDuesCharge(ctx, spec({ name: "x", dueDate: null, audience: { kind: "role", rates: [{ key: theirRole.id, amount: 10 }] } })))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(issueDuesCharge(ctx, spec({ name: "x", dueDate: null, audience: { kind: "pick", brotherIds: [theirMember.id], amount: { mode: "each", amount: 10 } } })))
      .rejects.toBeInstanceOf(ValidationError);
    expect(await owed(theirMember.id, other.id)).toBe(0);
    expect(await testPrisma.duesCharge.count()).toBe(0);
  });

  it("bills only this chapter's balance for a member of two chapters", async () => {
    const { maya, ctx } = await chapter();
    const other = await createOrg("Beta", "beta");
    await joinOrg({ brotherId: maya.id, orgId: other.id, duesOwed: 0 });
    await issueDuesCharge(ctx, everyone("Fall dues", 140));
    expect(await owed(maya.id, ctx.orgId)).toBe(140);
    expect(await owed(maya.id, other.id)).toBe(0);
  });

  it("skips people who already have a same-named charge this term, and bills them again on request", async () => {
    const { org, maya, leo, ctx } = await chapter();
    await issueDuesCharge(ctx, spec({ name: "Late fine", dueDate: null, audience: { kind: "pick", brotherIds: [maya.id], amount: { mode: "each", amount: 25 } } }));

    const skipped = await issueDuesCharge(ctx, spec({ name: "late FINE", dueDate: null, audience: { kind: "pick", brotherIds: [maya.id, leo.id], amount: { mode: "each", amount: 25 } } }));
    expect(skipped).toMatchObject({ people: 1, skipped: 1 });
    expect(await owed(maya.id)).toBe(25);
    expect(await owed(leo.id)).toBe(25);

    await expect(issueDuesCharge(ctx, spec({ name: "Late fine", dueDate: null, audience: { kind: "pick", brotherIds: [maya.id], amount: { mode: "each", amount: 25 } } })))
      .rejects.toThrow(/already has “Late fine”/);

    await issueDuesCharge(ctx, spec({ name: "Late fine", dueDate: null, onDuplicate: "bill", audience: { kind: "pick", brotherIds: [maya.id], amount: { mode: "each", amount: 25 } } }));
    expect(await owed(maya.id)).toBe(50);
    void org;
    await expectBooksAgree(ctx);
  });

  it("doesn't count a taken-back charge or another term's as a duplicate", async () => {
    const { org, maya, ctx } = await chapter();
    await createSemester({ orgId: org.id, label: "SP26", isActive: false });
    const first = await issueDuesCharge(ctx, everyone("Dues", 10));
    await voidDuesCharge(ctx, first.id);
    expect((await issueDuesCharge(ctx, everyone("Dues", 10))).skipped).toBe(0);
    expect((await issueDuesCharge(ctx, everyone("Dues", 10, { semester: "SP26" }))).skipped).toBe(0);
    expect(await owed(maya.id)).toBe(20);
    await expect(issueDuesCharge(ctx, everyone("Dues", 10, { semester: "NOPE" }))).rejects.toBeInstanceOf(NotFoundError);
    await expectBooksAgree(ctx);
  });

  it("files a charge under no term when none is active", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await createBrother({ orgId: org.id });
    const ctx = ctxFor(org.id, a.id);
    const res = await issueDuesCharge(ctx, everyone("Dues", 10));
    expect((await testPrisma.duesCharge.findUniqueOrThrow({ where: { id: res.id } })).semesterId).toBeNull();
  });

  it("is treasury-only, preview included", async () => {
    const { org, dev, maya } = await chapter();
    const rosterAdmin = ctxFor(org.id, dev.id, PERMISSIONS.MANAGE_BROTHERS);
    await expect(issueDuesCharge(rosterAdmin, everyone("Dues", 10))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(previewDuesCharge(rosterAdmin, everyone("Dues", 10))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await owed(maya.id)).toBe(0);
  });
});

describe("previewDuesCharge", () => {
  it("is exactly what issuing would write, and writes nothing", async () => {
    const { dev, jordan, treasurer, social, ctx } = await chapter();
    const input = spec({
      name: "Officer dues", dueDate: null,
      audience: { kind: "role", rates: [{ key: treasurer.id, amount: 60 }, { key: social.id, amount: 40 }] },
    });
    const p = await previewDuesCharge(ctx, input);
    expect(p).toMatchObject({ audienceLabel: "By role", selected: 2, people: 2, total: 140, stacked: 1, already: 0, skipped: 0, duplicateOf: null });
    expect(p.lines.find(l => l.brotherId === dev.id)).toEqual({
      brotherId: dev.id, amount: 100,
      parts: [{ key: treasurer.id, amount: 60 }, { key: social.id, amount: 40 }],
    });
    expect(await testPrisma.duesCharge.count()).toBe(0);
    expect(await owed(dev.id)).toBe(0);

    const issued = await issueDuesCharge(ctx, input);
    expect(issued).toMatchObject({ people: p.people, total: p.total });
    expect(await owed(jordan.id)).toBe(40);
  });

  it("names the duplicate and how many it would skip", async () => {
    const { maya, ctx } = await chapter();
    const first = await issueDuesCharge(ctx, spec({ name: "Fall dues", dueDate: null, audience: { kind: "pick", brotherIds: [maya.id], amount: { mode: "each", amount: 10 } } }));
    const p = await previewDuesCharge(ctx, everyone("Fall Dues", 10));
    expect(p).toMatchObject({ selected: 4, people: 3, already: 1, skipped: 1, total: 30 });
    expect(p.duplicateOf).toMatchObject({ id: first.id, name: "Fall dues" });
  });
});

describe("updateDuesCharge", () => {
  it("renames, moves the due date and changes the note without touching balances", async () => {
    const { org, maya, ctx } = await chapter();
    const c = await issueDuesCharge(ctx, everyone("Fall dues", 140));
    await updateDuesCharge(ctx, c.id, { name: "Fall dues (2026)", dueDate: null, note: "Pay Dev" });
    expect(await testPrisma.duesCharge.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ name: "Fall dues (2026)", dueDate: null, note: "Pay Dev" });
    expect(await owed(maya.id)).toBe(140);
    const [e] = await events(org.id, "dues.charge_updated");
    expect((e.metadata as { changedFields: string[] }).changedFields.sort()).toEqual(["dueDate", "name", "note"]);
  });

  it("refuses a taken-back charge and another org's charge", async () => {
    const { ctx } = await chapter();
    const c = await issueDuesCharge(ctx, everyone("Fall dues", 140));
    await voidDuesCharge(ctx, c.id);
    await expect(updateDuesCharge(ctx, c.id, { name: "x" })).rejects.toBeInstanceOf(NotFoundError);

    const other = await createOrg("Beta", "beta");
    const b = await createBrother({ orgId: other.id });
    const theirs = await issueDuesCharge(ctxFor(other.id, b.id), everyone("Beta dues", 5));
    await expect(updateDuesCharge(ctx, theirs.id, { name: "mine now" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(voidDuesCharge(ctx, theirs.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await testPrisma.duesCharge.findUniqueOrThrow({ where: { id: theirs.id } })).name).toBe("Beta dues");
  });
});

describe("voidDuesCharge (take back / undo)", () => {
  it("lowers every balance it raised and drops out of the board", async () => {
    const { maya, ctx } = await chapter();
    await issueDuesCharge(ctx, everyone("Fall dues", 140));
    const photo = await issueDuesCharge(ctx, everyone("Composite photo", 20));
    await voidDuesCharge(ctx, photo.id);

    expect(await owed(maya.id)).toBe(140);
    const board = await getDuesBoard(ctx);
    expect(board.charges.map(c => c.name)).toEqual(["Fall dues"]);
    await expect(voidDuesCharge(ctx, photo.id)).rejects.toBeInstanceOf(NotFoundError);
    await expectBooksAgree(ctx);
  });

  it("is refused, all-or-nothing, once someone no longer owes their line", async () => {
    const { maya, leo, ctx } = await chapter();
    const fall = await issueDuesCharge(ctx, everyone("Fall dues", 140));
    await pay(ctx, maya.id, 140);

    await expect(voidDuesCharge(ctx, fall.id)).rejects.toThrow(/1 person has already paid/);
    expect(await owed(leo.id)).toBe(140);
    expect((await testPrisma.duesCharge.findUniqueOrThrow({ where: { id: fall.id } })).voidedAt).toBeNull();
    expect(await testPrisma.duesChargeLine.count({ where: { chargeId: fall.id, voidedAt: { not: null } } })).toBe(0);
    await expectBooksAgree(ctx);
  });

  it("lets a payment re-flow to what's left when the member still owes at least their line", async () => {
    const { leo, ctx } = await chapter();
    await issueDuesCharge(ctx, everyone("Fall dues", 140));
    const photo = await issueDuesCharge(ctx, everyone("Composite photo", 20));
    await pay(ctx, leo.id, 100); // covered Fall dues first; Leo still owes 60 ≥ 20

    await voidDuesCharge(ctx, photo.id);
    expect(await owed(leo.id)).toBe(40);
    expect((await getMemberDuesBook(ctx, leo.id)).open).toEqual([expect.objectContaining({ name: "Fall dues", rest: 40 })]);
    await expectBooksAgree(ctx);
  });
});

describe("voidDuesChargeLine", () => {
  it("takes one person off, lowering only their balance", async () => {
    const { maya, leo, ctx } = await chapter();
    const fall = await issueDuesCharge(ctx, everyone("Fall dues", 140));
    await voidDuesChargeLine(ctx, fall.id, leo.id);
    expect(await owed(leo.id)).toBe(0);
    expect(await owed(maya.id)).toBe(140);
    expect((await getDuesBoard(ctx)).charges[0]).toMatchObject({ people: 3, total: 420 });
    await expect(voidDuesChargeLine(ctx, fall.id, leo.id)).rejects.toBeInstanceOf(NotFoundError);
    await expectBooksAgree(ctx);
  });

  it("is refused once they've paid it", async () => {
    const { leo, ctx } = await chapter();
    const fall = await issueDuesCharge(ctx, everyone("Fall dues", 140));
    await pay(ctx, leo.id, 140);
    await expect(voidDuesChargeLine(ctx, fall.id, leo.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await testPrisma.duesChargeLine.count({ where: { chargeId: fall.id, brotherId: leo.id, voidedAt: null } })).toBe(1);
    await expectBooksAgree(ctx);
  });
});

describe("waiveDues / voidDuesWaiver", () => {
  it("records the waiver with its reason, lowers the balance, and undoes cleanly", async () => {
    const { org, leo, ctx } = await chapter();
    await issueDuesCharge(ctx, everyone("Fall dues", 140));
    const w = await waiveDues(ctx, { brotherId: leo.id, amount: 40, reason: "Hardship" });
    expect(w).toMatchObject({ brotherId: leo.id, duesOwed: 100 });
    expect(await ledgerRows(org.id)).toBe(0);
    expect(await testPrisma.duesWaiver.findUniqueOrThrow({ where: { id: w.waiverId } })).toMatchObject({ reason: "Hardship", amountCents: 4000 });
    await expectBooksAgree(ctx);

    expect(await voidDuesWaiver(ctx, w.waiverId)).toMatchObject({ duesOwed: 140 });
    await expect(voidDuesWaiver(ctx, w.waiverId)).rejects.toBeInstanceOf(NotFoundError);
    await expectBooksAgree(ctx);
  });

  it("applies a waiver pinned to a charge to that charge", async () => {
    const { leo, ctx } = await chapter();
    await issueDuesCharge(ctx, spec({ name: "Fall dues", dueDate: "2026-10-01", audience: { kind: "all", amount: { mode: "each", amount: 140 } } }));
    const fine = await issueDuesCharge(ctx, spec({ name: "Late fine", dueDate: "2026-11-01", audience: { kind: "pick", brotherIds: [leo.id], amount: { mode: "each", amount: 25 } } }));
    await waiveDues(ctx, { brotherId: leo.id, amount: 25, chargeId: fine.id, reason: "First offence" });
    const book = await getMemberDuesBook(ctx, leo.id);
    expect(book.open.map(o => o.name)).toEqual(["Fall dues"]);
    await expectBooksAgree(ctx);
  });

  it("refuses more than they owe, or a charge they aren't on, and writes nothing", async () => {
    const { maya, leo, ctx } = await chapter();
    const fine = await issueDuesCharge(ctx, spec({ name: "Late fine", dueDate: null, audience: { kind: "pick", brotherIds: [maya.id], amount: { mode: "each", amount: 25 } } }));
    await expect(waiveDues(ctx, { brotherId: maya.id, amount: 30 })).rejects.toBeInstanceOf(ConflictError);
    await expect(waiveDues(ctx, { brotherId: leo.id, amount: 5, chargeId: fine.id })).rejects.toBeInstanceOf(ValidationError);
    expect(await testPrisma.duesWaiver.count()).toBe(0);
    expect(await owed(maya.id)).toBe(25);
  });

  it("only one of two racing waivers for the whole balance wins", async () => {
    const { maya, ctx } = await chapter();
    await issueDuesCharge(ctx, spec({ name: "Fine", dueDate: null, audience: { kind: "pick", brotherIds: [maya.id], amount: { mode: "each", amount: 25 } } }));
    const results = await Promise.allSettled([
      waiveDues(ctx, { brotherId: maya.id, amount: 25 }),
      waiveDues(ctx, { brotherId: maya.id, amount: 25 }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await owed(maya.id)).toBe(0);
    expect(await testPrisma.duesWaiver.count()).toBe(1);
    await expectBooksAgree(ctx);
  });
});

describe("adjustDues now goes through charges and waivers", () => {
  it("a charge becomes a one-person charge named after the reason", async () => {
    const { term, maya, ctx } = await chapter();
    const res = await adjustDues(ctx, { brotherId: maya.id, delta: 75, reason: "Chapter shirt" });
    expect(res.duesOwed).toBe(75);
    const c = await testPrisma.duesCharge.findFirstOrThrow();
    expect(c).toMatchObject({ name: "Chapter shirt", audienceKind: "single", audienceLabel: "Maya Rivera", dueDate: null, semesterId: term.id });
    await expectBooksAgree(ctx);
  });

  it("a waiver becomes a DuesWaiver row", async () => {
    const { maya, ctx } = await chapter();
    await adjustDues(ctx, { brotherId: maya.id, delta: 75, reason: null });
    expect((await testPrisma.duesCharge.findFirstOrThrow()).name).toBe("Dues");
    await adjustDues(ctx, { brotherId: maya.id, delta: -25, reason: "Hardship" });
    expect(await testPrisma.duesWaiver.findFirstOrThrow()).toMatchObject({ amountCents: 2500, reason: "Hardship" });
    expect(await owed(maya.id)).toBe(50);
    await expectBooksAgree(ctx);
  });
});

describe("payments keep the books agreeing", () => {
  it("through payment and void", async () => {
    const { leo, ctx } = await chapter();
    await issueDuesCharge(ctx, everyone("Fall dues", 140));
    const p = await pay(ctx, leo.id, 90);
    await expectBooksAgree(ctx);
    await softDeleteTransaction(ctx, p.id);
    expect(await owed(leo.id)).toBe(140);
    await expectBooksAgree(ctx);
  });

  it("voiding a payment from before the cutover grows the Earlier balance by the same amount", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await createBrother({ orgId: org.id, name: "Ava", duesOwed: 100 });
    const ctx = ctxFor(org.id, a.id);
    const old = await pay(ctx, a.id, 40); // pre-charges: owed is now 60
    // What the migration did: cutover now, the remaining 60 carried over.
    await testPrisma.organizationConfig.create({ data: { organizationId: org.id, duesLedgerStartedAt: new Date() } });
    const carry = await testPrisma.duesCharge.create({ data: { organizationId: org.id, name: "Earlier balance", audienceKind: "carryover", audienceLabel: "Carried over" } });
    await testPrisma.duesChargeLine.create({ data: { organizationId: org.id, chargeId: carry.id, brotherId: a.id, amountCents: 6000 } });
    await expectBooksAgree(ctx);

    await softDeleteTransaction(ctx, old.id);
    expect(await owed(a.id)).toBe(100);
    expect((await testPrisma.duesChargeLine.findFirstOrThrow({ where: { chargeId: carry.id } })).amountCents).toBe(10000);
    await expectBooksAgree(ctx);
  });

  it("re-creates an Earlier balance line for a member who had none", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await createBrother({ orgId: org.id, name: "Ava", duesOwed: 40 });
    const ctx = ctxFor(org.id, a.id);
    const old = await pay(ctx, a.id, 40); // paid in full before charges: no carryover line
    await testPrisma.organizationConfig.create({ data: { organizationId: org.id, duesLedgerStartedAt: new Date() } });

    await softDeleteTransaction(ctx, old.id);
    const line = await testPrisma.duesChargeLine.findFirstOrThrow({ where: { brotherId: a.id }, include: { charge: true } });
    expect(line).toMatchObject({ amountCents: 4000, charge: { audienceKind: "carryover", name: "Earlier balance" } });
    await expectBooksAgree(ctx);
  });

  it("refuses to flip a dues payment to scheduled", async () => {
    const { leo, ctx } = await chapter();
    await issueDuesCharge(ctx, everyone("Fall dues", 140));
    const p = await pay(ctx, leo.id, 40);
    await expect(updateTransaction(ctx, p.id, { status: "scheduled" })).rejects.toBeInstanceOf(ConflictError);
    await expectBooksAgree(ctx);
  });

  it("stays consistent when a charge and a payment race", async () => {
    const { maya, ctx } = await chapter();
    await issueDuesCharge(ctx, everyone("Fall dues", 140));
    await Promise.allSettled([
      issueDuesCharge(ctx, everyone("Composite photo", 20)),
      pay(ctx, maya.id, 150),
      waiveDues(ctx, { brotherId: maya.id, amount: 5 }),
    ]);
    await expectBooksAgree(ctx);
  });
});
