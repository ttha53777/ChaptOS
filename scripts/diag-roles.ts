import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL! });
  await client.connect();
  try {
    const dupes = await client.query<{ name: string; n: string }>(
      `SELECT name, COUNT(*)::text as n FROM "Brother" GROUP BY name HAVING COUNT(*) > 1 ORDER BY n DESC, name`,
    );
    console.log(`Duplicate brothers by name: ${dupes.rows.length}`);
    dupes.rows.forEach(r => console.log(`  ${r.name} × ${r.n}`));

    const total = await client.query<{ count: string }>(`SELECT COUNT(*)::text as count FROM "Brother"`);
    console.log(`Total brothers: ${total.rows[0].count}`);

    const roles = await client.query(`SELECT id, name, rank, permissions, "isSystem" FROM "Role" ORDER BY rank DESC`);
    console.log("Roles:");
    roles.rows.forEach(r => console.log(" ", r));

    const counts = await client.query(`SELECT r.name, COUNT(*) as n FROM "BrotherRole" br JOIN "Role" r ON r.id = br."roleId" GROUP BY r.name`);
    console.log("BrotherRole counts:");
    counts.rows.forEach(r => console.log(`  ${r.name}: ${r.n}`));
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
