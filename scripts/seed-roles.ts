/**
 * One-shot script to bring an existing populated database in line with the
 * system-roles schema. Run once after `npx prisma migrate deploy` to:
 *   1. Create/refresh the four built-in system roles (President, Treasurer,
 *      Social, PR) — idempotent via upsert by name.
 *   2. Walk every existing non-admin brother's `role` title and assign matching
 *      system roles (token match on " · ", aliases handled).
 *
 * Run:
 *   npx tsx scripts/seed-roles.ts
 *
 * Safe to re-run. Won't touch admin brothers (they bypass permissions anyway)
 * or wipe customizations made through the UI.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { seedSystemRoles, assignSystemRolesByTitle } from "../lib/seed-roles";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const roleIdByName = await seedSystemRoles(prisma);
  console.log(`✓ ${roleIdByName.size} system roles ready.`);
  for (const [name, id] of roleIdByName) console.log(`    ${name} → id=${id}`);

  const { assigned, brothersTouched } = await assignSystemRolesByTitle(prisma, roleIdByName);
  console.log(`✓ Assigned ${assigned} role(s) across ${brothersTouched} brothers.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
