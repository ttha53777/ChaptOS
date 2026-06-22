/**
 * RLS-enforced tenancy tests.
 *
 * Unlike org-isolation.test.ts (which runs as the schema owner and validates the
 * *application* wrapper), this suite connects as `figurints_test_app`
 * (NOBYPASSRLS) and exercises the Postgres RLS policies directly. It proves the
 * DB-layer backstop works *independent of* the app-layer WHERE injection — the
 * gap the Phase 1 audit flagged as "zero tests would catch an RLS regression".
 *
 * Each test installs the enforcing policies (the exact shapes Phase 3 ships),
 * seeds via the owner client, then reads/writes via the app client through
 * asOrg(). Teardown restores permissive allow_all so other suites are unaffected.
 *
 * Requires the `figurints_test_app` role (tests/setup/init-app-role.sql, created
 * at container init). If the role is missing the whole suite fails loudly rather
 * than silently passing as the owner.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { appPrisma, asOrg, applyEnforcingRls, dropEnforcingRls } from "../setup/rls";
import { createOrg, createBrother, createCalendarEvent, createTransaction, createSemester } from "../setup/factories";

beforeAll(async () => {
  await applyEnforcingRls();
});

afterAll(async () => {
  await dropEnforcingRls();
  await appPrisma.$disconnect();
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

describe("RLS: the app role is genuinely NOBYPASSRLS", () => {
  it("reports rolbypassrls = false (else every RLS test is a false pass)", async () => {
    const rows = await appPrisma.$queryRawUnsafe<{ rolbypassrls: boolean }[]>(
      `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]?.rolbypassrls).toBe(false);
  });
});

describe("RLS: org-column tables (direct organizationId scoping)", () => {
  it("a read with app.org_id set returns only that org's rows", async () => {
    const a = await createOrg("Alpha", "alpha");
    const b = await createOrg("Beta", "beta");
    await createBrother({ orgId: a.id, name: "A1" });
    await createBrother({ orgId: a.id, name: "A2" });
    await createBrother({ orgId: b.id, name: "B1" });

    const fromA = await asOrg(a.id, tx => tx.brother.findMany());
    expect(fromA.map(r => r.name).sort()).toEqual(["A1", "A2"]);

    const fromB = await asOrg(b.id, tx => tx.brother.findMany());
    expect(fromB.map(r => r.name)).toEqual(["B1"]);
  });

  it("a read with NO app.org_id returns ZERO rows (the prod failure the revert documents)", async () => {
    const a = await createOrg("Alpha", "alpha");
    await createBrother({ orgId: a.id, name: "A1" });

    // null → app.org_id stays '' → NULLIF('','') → NULL → organizationId = NULL → no rows.
    const rows = await asOrg(null, tx => tx.brother.findMany());
    expect(rows).toEqual([]);
  });

  it("count is org-scoped under RLS", async () => {
    const a = await createOrg("Alpha", "alpha");
    const b = await createOrg("Beta", "beta");
    await createBrother({ orgId: a.id });
    await createBrother({ orgId: a.id });
    await createBrother({ orgId: b.id });

    expect(await asOrg(a.id, tx => tx.brother.count())).toBe(2);
    expect(await asOrg(b.id, tx => tx.brother.count())).toBe(1);
  });
});

describe("RLS: relation-scoped join tables (parent subquery)", () => {
  it("AttendanceRecord is isolated via its CalendarEvent parent's org", async () => {
    const a = await createOrg("Alpha", "alpha");
    const b = await createOrg("Beta", "beta");
    const aSem = await createSemester({ orgId: a.id });
    const bSem = await createSemester({ orgId: b.id });
    const aEvent = await createCalendarEvent({ orgId: a.id, title: "A event" });
    const bEvent = await createCalendarEvent({ orgId: b.id, title: "B event" });
    const aBro = await createBrother({ orgId: a.id });
    const bBro = await createBrother({ orgId: b.id });
    // Seed records as owner (bypasses RLS) so the test data exists regardless.
    // createMany takes scalar FKs (no required relation object).
    await testPrisma.attendanceRecord.createMany({
      data: [
        { calendarEventId: aEvent.id, brotherId: aBro.id, semesterId: aSem.id, attended: true },
        { calendarEventId: bEvent.id, brotherId: bBro.id, semesterId: bSem.id, attended: true },
      ],
    });

    const fromA = await asOrg(a.id, tx => tx.attendanceRecord.findMany());
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.calendarEventId).toBe(aEvent.id);

    const fromB = await asOrg(b.id, tx => tx.attendanceRecord.findMany());
    expect(fromB).toHaveLength(1);
    expect(fromB[0]?.calendarEventId).toBe(bEvent.id);
  });
});

describe("RLS: WITH CHECK rejects cross-org writes", () => {
  it("inserting a row for another org is blocked even with an explicit organizationId", async () => {
    const a = await createOrg("Alpha", "alpha");
    const b = await createOrg("Beta", "beta");

    // Acting as org A, try to plant a transaction in org B. WITH CHECK evaluates
    // organizationId = app.org_id (= A), so a row tagged B violates the policy.
    await expect(
      asOrg(a.id, tx =>
        tx.transaction.create({
          data: {
            organizationId: b.id,
            type: "income", category: "Dues", amount: 100,
            amountCents: BigInt(10000), date: "2026-05-01", description: "cross-org",
          },
        }),
      ),
    ).rejects.toThrow();

    // And nothing landed in B.
    expect(await testPrisma.transaction.count({ where: { organizationId: b.id } })).toBe(0);
  });

  it("inserting a row for the active org succeeds", async () => {
    const a = await createOrg("Alpha", "alpha");
    const created = await asOrg(a.id, tx =>
      tx.transaction.create({
        data: {
          organizationId: a.id,
          type: "income", category: "Dues", amount: 50,
          amountCents: BigInt(5000), date: "2026-05-01", description: "ok",
        },
      }),
    );
    expect(created.organizationId).toBe(a.id);
  });
});

describe("RLS: backstop is independent of the app-layer filter", () => {
  it("a raw cross-org read (no app WHERE filter) is still blocked by RLS", async () => {
    // This is the key proof: org-isolation.test.ts can't catch this because as
    // the owner it bypasses RLS. Here, even a query with NO organizationId in the
    // WHERE (what a buggy/forgotten wrapper would emit) returns only the active
    // org's rows — the DB enforces it.
    const a = await createOrg("Alpha", "alpha");
    const b = await createOrg("Beta", "beta");
    await createTransaction({ orgId: a.id, description: "A tx" });
    await createTransaction({ orgId: b.id, description: "B tx" });

    const fromA = await asOrg(a.id, tx => tx.transaction.findMany()); // no where clause at all
    expect(fromA.map(r => r.description)).toEqual(["A tx"]);
  });
});
