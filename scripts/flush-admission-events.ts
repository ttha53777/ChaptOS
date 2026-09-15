import { config } from "dotenv";
config({ path: ".env.local" });
process.env.RLS_SET_ORG_ID = "1";

async function main() {
  const { flushAdmissionEvents } = await import("../lib/events/admission-delivery");
  const result = await flushAdmissionEvents();
  console.log(JSON.stringify(result));
  process.exit(result.failed ? 1 : 0);
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Delivery failed"); process.exit(1); });
