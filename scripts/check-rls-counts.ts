import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Sanity (with BYPASSRLS=true the postgres role bypasses RLS):");
  console.log("  brothers:",          await prisma.brother.count());
  console.log("  transactions:",      await prisma.transaction.count());
  console.log("  operationalEvents:", await prisma.operationalEvent.count());
}
main().finally(() => prisma.$disconnect());
