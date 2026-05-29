/**
 * Idempotent organization provisioning.
 *
 * Usage:
 *   npx tsx scripts/provision-org.ts <slug> <name> [adminBrotherId]
 *
 * Examples:
 *   npx tsx scripts/provision-org.ts beta "Beta Chapter"
 *   npx tsx scripts/provision-org.ts beta "Beta Chapter" 7   # also make brother 7 an org admin
 *
 * Creates the Organization row, seeds the four system roles, and optionally
 * promotes a Brother to org admin via Membership.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { seedSystemRolesForOrg } from "../lib/seed-roles";

const [slug, name, adminBrotherIdRaw] = process.argv.slice(2);

if (!slug || !name) {
  console.error("Usage: npx tsx scripts/provision-org.ts <slug> <name> [adminBrotherId]");
  process.exit(1);
}

const adminBrotherId = adminBrotherIdRaw ? Number(adminBrotherIdRaw) : null;
if (adminBrotherIdRaw && (!Number.isInteger(adminBrotherId) || adminBrotherId! <= 0)) {
  console.error(`Invalid adminBrotherId: ${adminBrotherIdRaw}`);
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Org (idempotent on slug).
  const org = await prisma.organization.upsert({
    where:  { slug },
    update: { name },
    create: { slug, name },
  });
  console.log(`Org #${org.id} (${org.slug}): ${org.name}`);

  // 2. System roles (idempotent on per-org name).
  const roleCount = await seedSystemRolesForOrg(prisma, org.id);
  console.log(`Seeded ${roleCount} system roles for ${org.slug}`);

  // 3. Optional admin membership.
  if (adminBrotherId) {
    const brother = await prisma.brother.findUnique({ where: { id: adminBrotherId } });
    if (!brother) {
      console.error(`Brother #${adminBrotherId} not found.`);
      process.exit(1);
    }
    await prisma.membership.upsert({
      where:  { brotherId_organizationId: { brotherId: adminBrotherId, organizationId: org.id } },
      update: { isOrgAdmin: true },
      create: { brotherId: adminBrotherId, organizationId: org.id, isOrgAdmin: true },
    });
    console.log(`Brother #${adminBrotherId} (${brother.name}) is now org admin of ${org.slug}`);
  }

  console.log("Done.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
