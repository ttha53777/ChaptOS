import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

// Counts transactions that share the same (type, category, amount, date,
// description) — the natural-key columns. Anything past the first copy is
// almost certainly an accidental double-submit and safe to delete.

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL! });
  await client.connect();
  try {
    const total = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "Transaction" WHERE "deletedAt" IS NULL`,
    );
    console.log(`Total non-deleted transactions: ${total.rows[0].count}`);

    const { rows } = await client.query<{
      type: string; category: string; amount: string; date: string;
      description: string; copies: number; ids: number[];
      created_ats: string[];
    }>(`
      SELECT type, category, amount::text, date, description,
             count(*)::int AS copies,
             array_agg(id ORDER BY id) AS ids,
             array_agg("createdAt"::text ORDER BY id) AS created_ats
      FROM "Transaction"
      WHERE "deletedAt" IS NULL
      GROUP BY type, category, amount, date, description
      HAVING count(*) > 1
      ORDER BY count(*) DESC, date DESC
      LIMIT 50;
    `);

    console.log(`Duplicate groups: ${rows.length}`);
    let extra = 0;
    for (const r of rows) {
      extra += r.copies - 1;
      const desc = r.description.length > 60 ? r.description.slice(0, 57) + "..." : r.description;
      console.log(`  [${r.date}] ${r.type} $${r.amount} · ${r.category} :: ${desc}`);
      console.log(`     -> ${r.copies} copies, ids: ${r.ids.join(",")}`);
    }
    console.log(`\nExtra rows that could be removed: ${extra}`);
  } finally { await client.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
