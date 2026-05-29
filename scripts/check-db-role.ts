import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ current_user: string; bypass: boolean }[]>(
    `SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`
  );
  console.log("DB role:", rows[0].current_user, "BYPASSRLS:", rows[0].bypass);
}
main().finally(() => prisma.$disconnect());
