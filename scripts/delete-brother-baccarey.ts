import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

const BROTHER_ID = 23; // Nathaniel Baccarey — confirmed via diag-tx-dupes / find script

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL! });
  await c.connect();
  try {
    await c.query("BEGIN");

    const { rows: before } = await c.query(
      `SELECT id, name FROM "Brother" WHERE id = $1`, [BROTHER_ID],
    );
    if (before.length === 0) throw new Error(`Brother id ${BROTHER_ID} not found`);
    if (before[0].name !== "Nathaniel Baccarey") {
      throw new Error(`Safety check failed: id ${BROTHER_ID} is "${before[0].name}", not "Nathaniel Baccarey"`);
    }

    // Delete dependents that lack ON DELETE CASCADE on the Brother FK.
    const att = await c.query(`DELETE FROM "AttendanceRecord" WHERE "brotherId" = $1`, [BROTHER_ID]);
    const exc = await c.query(`DELETE FROM "AttendanceExcuse" WHERE "brotherId" = $1`, [BROTHER_ID]);
    console.log(`Deleted ${att.rowCount} attendance records, ${exc.rowCount} excuses.`);

    // BrotherRole CASCADES; ActivityLog.actorId is SetNull — both handled by FK.
    const b = await c.query(`DELETE FROM "Brother" WHERE id = $1`, [BROTHER_ID]);
    console.log(`Deleted ${b.rowCount} brother.`);

    await c.query("COMMIT");
    console.log("Done.");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
