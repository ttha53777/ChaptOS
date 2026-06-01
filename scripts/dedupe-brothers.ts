/**
 * Removes duplicate brothers caused by running `prisma db seed` multiple times.
 * For each name with >1 row: keep the lowest-id row, delete the rest.
 *
 * Deletes cascading children of duplicates first:
 *   - AttendanceRecord, AttendanceExcuse (FK brotherId)
 *   - BrotherRole (FK brotherId; ON DELETE CASCADE handles this automatically
 *     but we explicit-delete for visibility)
 *   - ActivityLog (FK actorId, ON DELETE SET NULL — keeps the log entries)
 *
 * Run with `--dry` to preview without deleting:
 *   npx tsx scripts/dedupe-brothers.ts --dry
 *   npx tsx scripts/dedupe-brothers.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry");

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL! });
  await client.connect();
  try {
    // Find duplicate-name groups, identify the survivor (MIN(id)) and the victims.
    // CTE first ranks rows per name; then aggregate keeps id where rank > 1 as victims.
    const { rows: groups } = await client.query<{ name: string; survivor: number; victims: number[] | null }>(
      `WITH ranked AS (
         SELECT id, name,
                ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) AS rn
         FROM "Brother"
       )
       SELECT name,
              MIN(id) AS survivor,
              COALESCE(ARRAY_AGG(id ORDER BY id) FILTER (WHERE rn > 1), '{}') AS victims
       FROM ranked
       GROUP BY name
       HAVING COUNT(*) > 1
       ORDER BY name`,
    );

    if (groups.length === 0) {
      console.log("✓ No duplicate brothers.");
      return;
    }

    const allVictims = groups.flatMap(g => g.victims ?? []);
    console.log(`Found ${groups.length} duplicate names; ${allVictims.length} rows to delete.`);
    for (const g of groups) {
      console.log(`  ${g.name}: keep id=${g.survivor}, delete ${g.victims?.join(", ") ?? "(none)"}`);
    }

    if (DRY_RUN) {
      console.log("\n(dry run — no changes made)");
      return;
    }

    // Inspect FK children counts so the output is honest about what's being touched.
    const { rows: childCounts } = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM "AttendanceRecord" WHERE "brotherId" = ANY($1::int[])) as attendance,
         (SELECT COUNT(*) FROM "AttendanceExcuse" WHERE "brotherId" = ANY($1::int[])) as excuses,
         (SELECT COUNT(*) FROM "BrotherRole"      WHERE "brotherId" = ANY($1::int[])) as roles,
         (SELECT COUNT(*) FROM "ActivityLog"      WHERE "actorId"   = ANY($1::int[])) as activity`,
      [allVictims],
    );
    console.log("\nChild rows on victims:");
    console.log(`  AttendanceRecord: ${childCounts[0].attendance}`);
    console.log(`  AttendanceExcuse: ${childCounts[0].excuses}`);
    console.log(`  BrotherRole:      ${childCounts[0].roles}`);
    console.log(`  ActivityLog:      ${childCounts[0].activity} (will be NULLed via SET NULL FK, not deleted)`);

    await client.query("BEGIN");
    // AttendanceRecord and AttendanceExcuse don't have CASCADE — must delete first
    await client.query(`DELETE FROM "AttendanceRecord" WHERE "brotherId" = ANY($1::int[])`, [allVictims]);
    await client.query(`DELETE FROM "AttendanceExcuse" WHERE "brotherId" = ANY($1::int[])`, [allVictims]);
    // BrotherRole has CASCADE but explicit deletion is faster than triggering it row-by-row
    await client.query(`DELETE FROM "BrotherRole" WHERE "brotherId" = ANY($1::int[])`, [allVictims]);
    // ActivityLog: ON DELETE SET NULL on actorId, so just delete the brothers
    const del = await client.query(`DELETE FROM "Brother" WHERE id = ANY($1::int[])`, [allVictims]);
    await client.query("COMMIT");

    console.log(`\n✓ Deleted ${del.rowCount} duplicate brother rows.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
