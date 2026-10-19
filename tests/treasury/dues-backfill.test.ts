/**
 * The dues_charges migration's backfill, run verbatim from the migration file.
 *
 * It is the one step that touches every existing org's money at once: each
 * balance still owed becomes a line on one "Earlier balance" charge, and every
 * org gets a cutover so payments already netted into those balances aren't
 * counted again. If this is wrong, every chapter's Dues tab opens wrong.
 *
 * The test DB is built with `prisma db push`, so the tables exist; only the
 * BACKFILL BEGIN … END block is executed here.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createBrother, createOrg, joinOrg } from "../setup/factories";
import { db } from "@/lib/db";
import { getDuesBoard } from "@/lib/services/dues-charge-service";
import { getDuesReconciliation } from "@/lib/services/dues-service";
import { createTransaction } from "@/lib/services/transaction-service";
import { PERMISSIONS } from "@/lib/permissions";
import type { RequestContext } from "@/lib/context";

const migration = readFileSync(
  new URL("../../prisma/migrations/20261019000001_dues_charges/migration.sql", import.meta.url),
  "utf8",
);
const block = migration.slice(migration.indexOf("-- BACKFILL BEGIN"), migration.indexOf("-- BACKFILL END"));
const statements = block
  .split(/;\s*\n/)
  .map(s => s.split("\n").filter(l => !l.trim().startsWith("--")).join("\n").trim())
  .filter(Boolean);

async function runBackfill() {
  for (const sql of statements) await testPrisma.$executeRawUnsafe(sql);
}

function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Tester", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: PERMISSIONS.MANAGE_TREASURY, maxRank: 0, isOrgAdmin: false, isPlatformAdmin: false,
    db: db(orgId),
  };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("dues_charges backfill", () => {
  it("found the block", () => {
    expect(statements).toHaveLength(4);
  });

  it("turns each balance owed into one Earlier balance line per org, to the cent", async () => {
    const alpha = await createOrg("Alpha", "alpha");
    const beta = await createOrg("Beta", "beta");
    const quiet = await createOrg("Quiet", "quiet");
    // Float drift, a clean balance, a half-cent residue, and nothing owed.
    const drifted = await createBrother({ orgId: alpha.id, duesOwed: 199.99999999999997 });
    const cents = await createBrother({ orgId: alpha.id, duesOwed: 50.5 });
    const residue = await createBrother({ orgId: alpha.id, duesOwed: 0.004 });
    const square = await createBrother({ orgId: alpha.id, duesOwed: 0 });
    // The same person in two chapters owes each one separately.
    await joinOrg({ brotherId: cents.id, orgId: beta.id, duesOwed: 12 });
    await createBrother({ orgId: quiet.id, duesOwed: 0 });

    await runBackfill();

    const charges = await testPrisma.duesCharge.findMany({ orderBy: { organizationId: "asc" } });
    expect(charges.map(c => [c.organizationId, c.name, c.audienceKind, c.dueDate, c.semesterId])).toEqual([
      [alpha.id, "Earlier balance", "carryover", null, null],
      [beta.id, "Earlier balance", "carryover", null, null],
    ]);

    const lines = await testPrisma.duesChargeLine.findMany({ orderBy: [{ organizationId: "asc" }, { brotherId: "asc" }] });
    expect(lines.map(l => [l.organizationId, l.brotherId, l.amountCents])).toEqual([
      [alpha.id, drifted.id, 20000],
      [alpha.id, cents.id, 5050],
      [beta.id, cents.id, 1200],
    ]);
    expect(lines.some(l => l.brotherId === residue.id || l.brotherId === square.id)).toBe(false);

    // Every org gets a cutover, including ones with no config row before.
    const configs = await testPrisma.organizationConfig.findMany();
    expect(configs.map(c => c.organizationId).sort()).toEqual([alpha.id, beta.id, quiet.id].sort());
    expect(configs.every(c => c.duesLedgerStartedAt instanceof Date)).toBe(true);
    // Stamped in UTC like everything Prisma writes, whatever the session's zone.
    for (const c of configs) expect(Math.abs(c.duesLedgerStartedAt!.getTime() - Date.now())).toBeLessThan(60_000);
    for (const c of charges) expect(Math.abs(c.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("leaves the books agreeing: no drift, and old payments aren't counted twice", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await createBrother({ orgId: org.id, duesOwed: 200 });
    const b = await createBrother({ orgId: org.id, duesOwed: 75 });
    const ctx = ctxFor(org.id, a.id);
    // History: a paid $60 before charges existed, which already lowered duesOwed to $140.
    await createTransaction(ctx, { type: "income", category: "Dues", brotherId: a.id, amount: 60, date: "2026-09-01", description: "Dues", status: "posted", calendarEventIds: [] });

    await runBackfill();

    const recon = await getDuesReconciliation(ctx);
    expect(recon.driftCount).toBe(0);
    expect(recon.members.find(m => m.id === a.id)).toMatchObject({ owed: 140, chargedOwed: 140, paid: 60 });

    const board = await getDuesBoard(ctx);
    expect(board.charges).toHaveLength(1);
    expect(board.charges[0]).toMatchObject({ name: "Earlier balance", people: 2, total: 215, outstanding: 215, overdue: false });
    expect(board.members.find(m => m.brotherId === a.id)).toMatchObject({ standing: "due", billed: 140, paid: 0, owes: 140 });

    // A payment after the cutover does count.
    await createTransaction(ctx, { type: "income", category: "Dues", brotherId: b.id, amount: 75, date: "2026-10-19", description: "Dues", status: "posted", calendarEventIds: [] });
    expect((await getDuesBoard(ctx)).members.find(m => m.brotherId === b.id)).toMatchObject({ standing: "paid", owes: 0 });
    expect((await getDuesReconciliation(ctx)).driftCount).toBe(0);
  });

  it("keeps an existing config row's settings", async () => {
    const org = await createOrg("Alpha", "alpha");
    await testPrisma.organizationConfig.create({ data: { organizationId: org.id, openingBalance: 4200, instagramHandle: "alpha" } });
    await runBackfill();
    const cfg = await testPrisma.organizationConfig.findUnique({ where: { organizationId: org.id } });
    expect(cfg).toMatchObject({ openingBalance: 4200, instagramHandle: "alpha" });
    expect(cfg?.duesLedgerStartedAt).toBeInstanceOf(Date);
  });
});
