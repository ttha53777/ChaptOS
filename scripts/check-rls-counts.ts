/**
 * check-rls-counts.ts — Phase 4 observability script.
 *
 * Connects as the NOBYPASSRLS app role (figurints_app) with app.org_id set
 * via SET LOCAL, mirroring exactly how production queries run under enforcing
 * RLS. Use this before and after the Phase 4 flip to confirm:
 *
 *   1. Counts are non-zero for the target org (enforcing policy is satisfied).
 *   2. Counts match the BYPASSRLS (postgres) totals for that org — not zero
 *      (under-scoped) and not cross-org totals (over-scoped).
 *   3. A second org id returns different (isolated) counts.
 *
 * Usage:
 *   APP_DATABASE_URL=<app-role DSN> ORG_ID=<id> [ORG_ID_2=<id>] \
 *     npx tsx scripts/check-rls-counts.ts
 *
 * APP_DATABASE_URL must be a connection string for figurints_app (or the Supabase
 * `anon`/restricted role that maps to it). If unset, falls back to the
 * TEST_APP_DATABASE_URL pattern used by the test suite (localhost:54330).
 *
 * ORG_ID      — org to probe (required).
 * ORG_ID_2    — optional second org; if set, counts for it must differ from ORG_ID.
 *
 * BYPASSRLS baseline:
 *   The script also runs the same counts via DATABASE_URL (the superuser / BYPASSRLS
 *   path) with an explicit `organizationId` WHERE clause and prints both side-by-side
 *   so you can confirm the app-role path returns the same numbers.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ??
  process.env.TEST_APP_DATABASE_URL ??
  "postgresql://figurints_test_app:figurints_test_app@localhost:54330/figurints_test?schema=public";

// App-role client (NOBYPASSRLS) — subject to enforcing RLS.
const appPool = new Pool({ connectionString: APP_DATABASE_URL, max: 2 });
const appPrisma = new PrismaClient({ adapter: new PrismaPg(appPool) });

// Superuser / BYPASSRLS client — baseline counts.
const bypassPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run `fn` as the app client with `app.org_id` pinned via SET LOCAL for the
 * duration of a single transaction — identical to the db() production path.
 */
async function asOrg<T>(orgId: number, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return appPrisma.$transaction(async tx => {
    await (tx as unknown as { $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<unknown> })
      .$executeRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, String(orgId));
    return fn(tx as unknown as PrismaClient);
  });
}

interface OrgCounts {
  brothers:       number;
  transactions:   number;
  calendarEvents: number;
  memberships:    number;
  orgConfig:      number;
}

async function appCounts(orgId: number): Promise<OrgCounts> {
  return asOrg(orgId, async tx => ({
    brothers:       await tx.brother.count(),
    transactions:   await tx.transaction.count(),
    calendarEvents: await tx.calendarEvent.count(),
    memberships:    await tx.membership.count(),
    orgConfig:      await tx.organizationConfig.count(),
  }));
}

async function bypassCounts(orgId: number): Promise<OrgCounts> {
  return {
    brothers:       await bypassPrisma.brother.count({ where: { organizationId: orgId } }),
    transactions:   await bypassPrisma.transaction.count({ where: { organizationId: orgId } }),
    calendarEvents: await bypassPrisma.calendarEvent.count({ where: { organizationId: orgId } }),
    memberships:    await bypassPrisma.membership.count({ where: { organizationId: orgId } }),
    orgConfig:      await bypassPrisma.organizationConfig.count({ where: { organizationId: orgId } }),
  };
}

function printRow(label: string, c: OrgCounts) {
  console.log(
    `  ${label.padEnd(14)}  brothers=${c.brothers}  tx=${c.transactions}  events=${c.calendarEvents}  members=${c.memberships}  cfg=${c.orgConfig}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const orgId = parseInt(process.env.ORG_ID ?? "", 10);
  if (!orgId || orgId <= 0) {
    console.error("ERROR: set ORG_ID=<positive integer> in the environment.");
    process.exit(1);
  }

  // Confirm the app-role role name and BYPASSRLS flag.
  const roleRows = await appPrisma.$queryRawUnsafe<{ current_user: string; bypass: boolean }[]>(
    `SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`,
  );
  const { current_user, bypass } = roleRows[0];
  if (bypass) {
    console.warn(`WARNING: ${current_user} has BYPASSRLS=true — enforcing RLS is a no-op for this role!`);
  } else {
    console.log(`App role: ${current_user}  BYPASSRLS=${bypass}  ✓`);
  }

  console.log(`\nOrg ${orgId} counts:`);
  const [app, bp] = await Promise.all([appCounts(orgId), bypassCounts(orgId)]);
  printRow("app-role", app);
  printRow("bypass", bp);

  const mismatch = (Object.keys(app) as (keyof OrgCounts)[]).filter(k => app[k] !== bp[k]);
  if (mismatch.length) {
    console.error(`\nMISMATCH on: ${mismatch.join(", ")} — app-role counts differ from bypass baseline!`);
    process.exitCode = 1;
  } else if (app.brothers === 0 && app.transactions === 0 && app.calendarEvents === 0) {
    console.error(`\nWARNING: all counts are zero — either org ${orgId} has no data or app.org_id is not being set.`);
    process.exitCode = 1;
  } else {
    console.log(`\n✓ Counts match baseline for org ${orgId}.`);
  }

  // Optional second org — confirm isolation.
  const orgId2 = parseInt(process.env.ORG_ID_2 ?? "", 10);
  if (orgId2 > 0) {
    console.log(`\nOrg ${orgId2} counts (isolation check):`);
    const [app2, bp2] = await Promise.all([appCounts(orgId2), bypassCounts(orgId2)]);
    printRow("app-role", app2);
    printRow("bypass", bp2);

    const mismatch2 = (Object.keys(app2) as (keyof OrgCounts)[]).filter(k => app2[k] !== bp2[k]);
    if (mismatch2.length) {
      console.error(`\nMISMATCH on org ${orgId2}: ${mismatch2.join(", ")}`);
      process.exitCode = 1;
    }

    // Check that at least one count differs between the two orgs (confirms isolation).
    const identical = (Object.keys(app) as (keyof OrgCounts)[]).every(k => app[k] === app2[k]);
    if (identical) {
      console.warn(
        `\nWARNING: all counts are identical across org ${orgId} and org ${orgId2} — ` +
        `possible cross-org data leak or both orgs genuinely have the same counts.`,
      );
    } else {
      console.log(`\n✓ Org ${orgId} and org ${orgId2} return different counts — isolation holds.`);
    }
  }
}

main().finally(async () => {
  await appPrisma.$disconnect();
  await bypassPrisma.$disconnect();
  await appPool.end();
});
