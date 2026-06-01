import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL! });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, name, "auth_user_id" IS NOT NULL as linked, email, "isAdmin"
       FROM "Brother"
       WHERE name IN (
         SELECT name FROM "Brother" GROUP BY name HAVING COUNT(*) > 1
       )
       ORDER BY name, id`,
    );
    let last = "";
    for (const r of rows) {
      if (r.name !== last) { console.log(`\n${r.name}:`); last = r.name; }
      console.log(`  id=${r.id} linked=${r.linked} admin=${r.isAdmin} email=${r.email ?? "—"}`);
    }
  } finally { await client.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
