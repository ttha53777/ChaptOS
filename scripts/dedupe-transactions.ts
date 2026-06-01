import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

// Soft-deletes duplicate Transaction rows that share the same natural key
// (type, category, amount, date, description). Keeps the row with the lowest
// id in each group (the original seed insert) and stamps `deletedAt` on the
// rest, so the Treasury UI (which filters `!t.deletedAt`) stops showing them.
//
// Reversible: every soft-deleted row gets `deletedAt = NOW()`, so a single
//   UPDATE "Transaction" SET "deletedAt" = NULL WHERE "deletedAt" >= '<ts>'
// undoes this script.

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL! });
  await client.connect();
  try {
    await client.query("BEGIN");

    // Identify ids to soft-delete: in each natural-key group, anything that
    // isn't the MIN(id). Only consider currently-live rows.
    const { rows: toDelete } = await client.query<{ id: number }>(`
      WITH groups AS (
        SELECT id,
               row_number() OVER (
                 PARTITION BY type, category, amount, date, description
                 ORDER BY id ASC
               ) AS rn
        FROM "Transaction"
        WHERE "deletedAt" IS NULL
      )
      SELECT id FROM groups WHERE rn > 1
    `);

    console.log(`Rows to soft-delete: ${toDelete.length}`);
    if (toDelete.length === 0) {
      console.log("Nothing to do.");
      await client.query("COMMIT");
      return;
    }

    const ids = toDelete.map(r => r.id);
    const res = await client.query(
      `UPDATE "Transaction" SET "deletedAt" = NOW() WHERE id = ANY($1::int[])`,
      [ids],
    );
    console.log(`Soft-deleted ${res.rowCount} rows.`);
    console.log(`Sample ids: ${ids.slice(0, 10).join(",")}${ids.length > 10 ? "…" : ""}`);

    await client.query("COMMIT");
    console.log("\nDone. Refresh /treasury to verify.");
    console.log("To undo: UPDATE \"Transaction\" SET \"deletedAt\" = NULL WHERE id = ANY('{" + ids.join(",") + "}');");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
