import { config } from "dotenv";
config({ path: ".env.local" });
import { prisma } from "../lib/prisma";

async function main() {
  try {
    const roles = await prisma.role.findMany({
      orderBy: [{ rank: "desc" }, { name: "asc" }],
      include: { _count: { select: { brothers: true } } },
    });
    console.log(`✓ findMany OK, ${roles.length} roles`);
    console.log(JSON.stringify(roles, null, 2));
  } catch (e) {
    console.error("findMany threw:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}
main();
