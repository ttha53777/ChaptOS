/**
 * RLS-enforced test harness.
 *
 * The default test client (`testPrisma`) connects as the schema owner, which
 * effectively bypasses RLS — so the existing suite only exercises the
 * application-layer wrapper. This module adds:
 *
 *   - `appPrisma`: a client connecting as `figurints_test_app` (NOBYPASSRLS),
 *     mirroring production's `figurints_app`. RLS policies actually filter this
 *     client.
 *   - `applyEnforcingRls()` / `dropEnforcingRls()`: install/remove the enforcing
 *     `org_isolation` policies — the exact shapes Phase 3 will ship to prod —
 *     plus the GRANTs the app role needs. Called per-run because `prisma db push
 *     --force-reset` recreates the schema (dropping all grants/policies) before
 *     every test session.
 *   - `asOrg(orgId, fn)`: run a callback as the app client with `app.org_id` set
 *     via `SET LOCAL` inside a transaction — the same mechanism Phase 2 will use
 *     in lib/db/tenant.ts. Pass `null` to simulate "no org context set" (the
 *     production failure mode the 20260601000003 revert documents).
 *
 * The role itself is created at container init (tests/setup/init-app-role.sql).
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../app/generated/prisma/client";

const APP_DATABASE_URL =
  process.env.TEST_APP_DATABASE_URL ??
  "postgresql://figurints_test_app:figurints_test_app@localhost:54330/figurints_test?schema=public";

/** Client connecting as the NOBYPASSRLS app-equivalent role. RLS filters this. */
export const appPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: APP_DATABASE_URL }) });

// Tables that carry an `organizationId` column → scope directly.
// Keep in sync with the org-scoped models in prisma/schema.prisma. This is the
// list Phase 3's migration will enforce; the test asserts the shape works.
const ORG_COLUMN_TABLES = [
  "ActivityLog", "Brother", "BrotherMetricValue", "BrotherRole", "Budget",
  "CalendarEvent", "ChapterAnnouncement", "Doc", "InstagramTask", "Membership",
  "OperationalEvent", "OrgInvite", "OrgMetricDefinition", "OrganizationConfig",
  "PartyEvent", "ProgrammingChecklistItem", "ProgrammingEvent",
  "ProgrammingEventDoc", "Reimbursement", "Role", "Semester", "ServiceEvent",
  "ServiceParticipation", "Task", "TaskAssignment", "Transaction",
] as const;

// Org-column-less join tables → scope through an org-bound parent via subquery.
// Mirrors the relation scoping in lib/db/tenant.ts's join-table wrappers.
const RELATION_SCOPED: { table: string; parent: string; fk: string }[] = [
  { table: "AttendanceRecord",        parent: "CalendarEvent", fk: "calendarEventId" },
  { table: "AttendanceExcuse",        parent: "Brother",       fk: "brotherId" },
  { table: "BudgetAllocation",        parent: "Budget",        fk: "budgetId" },
  { table: "InviteRedemption",        parent: "OrgInvite",     fk: "inviteId" },
  { table: "TransactionCalendarEvent", parent: "Transaction",  fk: "transactionId" },
];

const orgVar = `NULLIF(current_setting('app.org_id', true), '')::integer`;

/**
 * Install enforcing RLS + the GRANTs the NOBYPASSRLS app role needs. Idempotent.
 * Run after `db push` has (re)created the schema.
 */
export async function applyEnforcingRls(): Promise<void> {
  // GRANTs: the app role owns nothing, so it needs schema + table + sequence
  // privileges, matching the production figurints_app grants. `db push
  // --force-reset` drops and recreates the public schema, which also drops the
  // init-time `GRANT USAGE ON SCHEMA public` — so re-grant schema USAGE here, not
  // just at container init. Missing sequence GRANTs surface as "permission denied
  // for sequence" on INSERT.
  await testExec(`
    GRANT USAGE ON SCHEMA public TO figurints_test_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO figurints_test_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO figurints_test_app;
  `);

  for (const tbl of ORG_COLUMN_TABLES) {
    await testExec(`ALTER TABLE "${tbl}" ENABLE ROW LEVEL SECURITY;`);
    await testExec(`ALTER TABLE "${tbl}" FORCE ROW LEVEL SECURITY;`);
    await testExec(`DROP POLICY IF EXISTS allow_all ON "${tbl}";`);
    await testExec(`DROP POLICY IF EXISTS org_isolation ON "${tbl}";`);
    await testExec(
      `CREATE POLICY org_isolation ON "${tbl}"
         USING ("organizationId" = ${orgVar})
         WITH CHECK ("organizationId" = ${orgVar});`,
    );
  }

  for (const { table, parent, fk } of RELATION_SCOPED) {
    await testExec(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    await testExec(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`);
    await testExec(`DROP POLICY IF EXISTS allow_all ON "${table}";`);
    await testExec(`DROP POLICY IF EXISTS org_isolation ON "${table}";`);
    await testExec(
      `CREATE POLICY org_isolation ON "${table}"
         USING (EXISTS (
           SELECT 1 FROM "${parent}" p
           WHERE p."id" = "${table}"."${fk}" AND p."organizationId" = ${orgVar}
         ))
         WITH CHECK (EXISTS (
           SELECT 1 FROM "${parent}" p
           WHERE p."id" = "${table}"."${fk}" AND p."organizationId" = ${orgVar}
         ));`,
    );
  }

  // Organization root: scope by id (the row IS the org).
  await testExec(`ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;`);
  await testExec(`ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;`);
  await testExec(`DROP POLICY IF EXISTS allow_all ON "Organization";`);
  await testExec(`DROP POLICY IF EXISTS org_isolation ON "Organization";`);
  await testExec(`CREATE POLICY org_isolation ON "Organization" USING ("id" = ${orgVar});`);
}

/** Remove enforcing RLS (restore permissive allow_all). Idempotent. */
export async function dropEnforcingRls(): Promise<void> {
  const all = [...ORG_COLUMN_TABLES, ...RELATION_SCOPED.map(r => r.table), "Organization"];
  for (const tbl of all) {
    await testExec(`DROP POLICY IF EXISTS org_isolation ON "${tbl}";`);
    await testExec(`DROP POLICY IF EXISTS allow_all ON "${tbl}";`);
    await testExec(`CREATE POLICY allow_all ON "${tbl}" USING (true);`);
    await testExec(`ALTER TABLE "${tbl}" NO FORCE ROW LEVEL SECURITY;`);
  }
}

/**
 * Run `fn` as the app (NOBYPASSRLS) client with `app.org_id` pinned via SET LOCAL
 * for the duration of one transaction — the mechanism Phase 2 will adopt in
 * db().  `orgId = null` leaves the var unset (empty string), reproducing the
 * "plain read returns zero rows" failure mode.
 */
export async function asOrg<T>(
  orgId: number | null,
  fn: (tx: Parameters<Parameters<typeof appPrisma.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return appPrisma.$transaction(async tx => {
    // set_config(name, value, is_local=true) == SET LOCAL; parameterized so the
    // value can't carry SQL even though orgId is numeric here.
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.org_id', $1, true)`,
      orgId === null ? "" : String(Math.trunc(orgId)),
    );
    return fn(tx);
  });
}

// The app role can't run DDL (NOCREATEDB/NOSUPERUSER and owns nothing), so all
// schema/grant changes go through the owner client. Imported lazily to avoid a
// circular import with tests/setup/prisma.ts at module load.
async function testExec(sql: string): Promise<void> {
  const { testPrisma } = await import("./prisma");
  await testPrisma.$executeRawUnsafe(sql);
}
