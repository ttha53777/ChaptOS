import { config } from "dotenv";
config({ path: ".env.local" });
process.env.RLS_SET_ORG_ID = "1";

// Drain the push outbox once: retry leftovers, drop expired pushes, check
// receipts and prune dead tokens. Same job as GET /api/cron/push.
async function main() {
  const { flushPush } = await import("../lib/push/sender");
  const result = await flushPush(2000);
  console.log(JSON.stringify(result));
  process.exit(0);
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Push flush failed"); process.exit(1); });
