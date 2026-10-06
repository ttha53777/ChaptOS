/**
 * Which term a ledger row is filed under.
 *
 * Every transaction form used to default its Period to a hardcoded "SPR26", so
 * an org whose only term was Fall 2026 opened Treasury on a Spring 2026 it never
 * created and kept filing money under it. The server now decides the term when
 * the client doesn't send one, and termOfTx places legacy rows by date.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import { createTransaction, listTransactionsForExport } from "@/lib/services/transaction-service";
import { PERMISSIONS } from "@/lib/permissions";
import { termOfTx, inTerm } from "@/lib/treasury-term";
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

const tx = (over: Record<string, unknown> = {}) => ({
  type: "expense" as const, category: "Misc", amount: 25, date: "2026-09-10",
  description: "Snacks", status: "posted" as const, calendarEventIds: [], ...over,
});

async function fallChapter() {
  const org = await createOrg("Alpha", "alpha");
  const fall = await createSemester({ orgId: org.id, label: "Fall 2026", startDate: "2026-08-22", endDate: "2026-12-15", isActive: true });
  const member = await createBrother({ orgId: org.id, name: "Noah Kim" });
  return { org, fall, ctx: ctxFor(org.id, member.id) };
}

describe("createTransaction term", () => {
  it("files a row with no term under the active one", async () => {
    const { ctx, fall } = await fallChapter();
    await createTransaction(ctx, tx());
    const row = await testPrisma.transaction.findFirstOrThrow({ where: { description: "Snacks" } });
    expect(row.semester).toBe("Fall 2026");
    expect(row.semesterId).toBe(fall.id);
  });

  it("keeps a term the client picked and links its Semester", async () => {
    const { ctx, org } = await fallChapter();
    const spring = await createSemester({ orgId: org.id, label: "Spring 2027", startDate: "2027-01-10", endDate: "2027-05-08", isActive: false });
    await createTransaction(ctx, tx({ semester: "Spring 2027" }));
    const row = await testPrisma.transaction.findFirstOrThrow({ where: { description: "Snacks" } });
    expect(row.semester).toBe("Spring 2027");
    expect(row.semesterId).toBe(spring.id);
  });

  it("exports a legacy-labelled row under the term its date falls in", async () => {
    const { ctx, org } = await fallChapter();
    await testPrisma.transaction.create({
      data: { organizationId: org.id, type: "income", category: "Dues", amount: 50, amountCents: BigInt(5000), date: "2026-09-22", description: "Old stamp", semester: "SPR26" },
    });
    const rows = await listTransactionsForExport(ctx, "Fall 2026");
    expect(rows.map(r => r.description)).toEqual(["Old stamp"]);
  });
});

describe("termOfTx", () => {
  const terms = [
    { label: "Fall 2026", startDate: "2026-08-22", endDate: "2026-12-15" },
    { label: "SPR26", startDate: "2026-01-05", endDate: "2026-05-10" },
  ];

  it("trusts a label that names a real term", () => {
    expect(termOfTx({ semester: "SPR26", date: "2026-09-01" }, terms)).toBe("SPR26");
  });
  it("places an unknown or missing label by date", () => {
    expect(termOfTx({ semester: "SPR25", date: "2026-09-01" }, terms)).toBe("Fall 2026");
    expect(termOfTx({ semester: null, date: "2026-02-01" }, terms)).toBe("SPR26");
  });
  it("keeps its own label when no term covers the date", () => {
    expect(termOfTx({ semester: "SPR25", date: "2025-03-01" }, terms)).toBe("SPR25");
  });
  it("inTerm uses the term's range, else the year a code ends in", () => {
    expect(inTerm("2026-09-01", "Fall 2026", terms)).toBe(true);
    expect(inTerm("2027-01-01", "Fall 2026", terms)).toBe(false);
    expect(inTerm("2025-04-01", "SPR25", terms)).toBe(true);
  });
});
