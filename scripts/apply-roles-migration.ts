/**
 * One-shot: apply prisma/migrations/20260525000000_add_roles_and_permissions/migration.sql
 * via a direct pg connection. Bypasses `prisma migrate dev` so the existing
 * (drifted) migration history isn't touched. Safe to re-run — every statement
 * in the SQL is guarded with IF NOT EXISTS / DO blocks.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL must be set");

  const sql = readFileSync(
    resolve(__dirname, "../prisma/migrations/20260525000000_add_roles_and_permissions/migration.sql"),
    "utf8",
  );

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log("✓ Migration applied.");

    // Quick sanity check — confirm the tables exist now.
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('Role', 'BrotherRole')
       ORDER BY table_name`,
    );
    console.log(`✓ Tables present: ${rows.map(r => r.table_name).join(", ") || "(none — something went wrong)"}`);
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
