/**
 * Pre-flight for 20260807000001_drop_accountless_members.
 *
 * That migration deletes every Brother with no auth account — the roster rows
 * officers used to type in before the person ever signed in. It is irreversible
 * and the FK cascades take attendance, service hours and metric values with it.
 * Run this against the target database and READ THE NUMBERS before applying it.
 *
 *   npx tsx --env-file=.env.local scripts/preflight-accountless.ts
 *
 * Uses prismaPrivileged (DIRECT_URL) deliberately: this is a cross-org question
 * asked with no active org, so the app role has no app.org_id to SET LOCAL and
 * would return zeros for every RLS-enforcing table rather than error — which
 * would read as "nothing to delete" and is the worst possible answer here.
 */

import { prismaPrivileged } from "../lib/prisma-privileged"; // lint-direct-prisma:ignore cross-org pre-flight, no active org

interface OrgRow {
  slug:       string;
  roster:     number;
  no_account: number;
  their_dues: number;
}

interface CascadeRow {
  attendance:    number;
  ledger_tx:     number;
  service:       number;
  metric_values: number;
  redemptions:   number;
  platform_held: number;
  total:         number;
}

async function main() {
  const orgs = await prismaPrivileged.$queryRawUnsafe<OrgRow[]>(`
    SELECT o.slug,
           count(m.*)::int                                        AS roster,
           count(*) FILTER (WHERE b."auth_user_id" IS NULL)::int   AS no_account,
           coalesce(sum(m."duesOwed") FILTER (WHERE b."auth_user_id" IS NULL), 0)::float AS their_dues
    FROM "Organization" o
    JOIN "Membership"   m ON m."organizationId" = o.id
    JOIN "Brother"      b ON b.id = m."brotherId"
    GROUP BY o.slug
    HAVING count(*) FILTER (WHERE b."auth_user_id" IS NULL) > 0
    ORDER BY 3 DESC`);

  const [cascade] = await prismaPrivileged.$queryRawUnsafe<CascadeRow[]>(`
    SELECT
      (SELECT count(*) FROM "AttendanceRecord"     a JOIN "Brother" b ON b.id = a."brotherId" WHERE b."auth_user_id" IS NULL)::int AS attendance,
      (SELECT count(*) FROM "Transaction"          t JOIN "Brother" b ON b.id = t."brotherId" WHERE b."auth_user_id" IS NULL)::int AS ledger_tx,
      (SELECT count(*) FROM "ServiceParticipation" s JOIN "Brother" b ON b.id = s."brotherId" WHERE b."auth_user_id" IS NULL)::int AS service,
      (SELECT count(*) FROM "BrotherMetricValue"   v JOIN "Brother" b ON b.id = v."brotherId" WHERE b."auth_user_id" IS NULL)::int AS metric_values,
      (SELECT count(*) FROM "InviteRedemption"     r JOIN "Brother" b ON b.id = r."brotherId" WHERE b."auth_user_id" IS NULL)::int AS redemptions,
      (SELECT count(*) FROM "PlatformAdmin"       pa JOIN "Brother" b ON b.id = pa."brotherId" WHERE b."auth_user_id" IS NULL)::int AS platform_held,
      (SELECT count(*) FROM "Brother" WHERE "auth_user_id" IS NULL)::int AS total`);

  if (orgs.length === 0) {
    console.log("\nNothing to delete: every roster row is backed by an account.\n");
    return;
  }

  console.log("\nRoster rows with no account attached — THESE WILL BE DELETED\n");
  console.log("  org".padEnd(22) + "roster".padStart(8) + "no-account".padStart(13) + "their dues".padStart(13));
  console.log("  " + "─".repeat(54));
  for (const o of orgs) {
    console.log(
      "  " + o.slug.padEnd(20) +
      String(o.roster).padStart(8) +
      String(o.no_account).padStart(13) +
      ("$" + o.their_dues.toFixed(2)).padStart(13) +
      (o.no_account === o.roster ? "   ← entire roster" : ""),
    );
  }

  console.log(`\n  ${cascade.total} accountless Brothers total.\n`);
  console.log("Child rows that go with them (FK cascade):");
  console.log(`  attendance records      ${cascade.attendance}`);
  console.log(`  service participations  ${cascade.service}`);
  console.log(`  custom metric values    ${cascade.metric_values}`);
  console.log(`  invite redemptions      ${cascade.redemptions}`);
  console.log(`  ledger transactions     ${cascade.ledger_tx}  (SET NULL — the money row survives, unattributed)`);

  if (cascade.platform_held > 0) {
    console.log(`\n  ${cascade.platform_held} of these hold a PlatformAdmin grant and will be SKIPPED by the`);
    console.log("  migration (PlatformAdmin.brotherId is ON DELETE RESTRICT). Resolve by hand.");
  }
  console.log("\nThis cannot be undone. Take a backup before applying the migration.\n");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prismaPrivileged.$disconnect());
