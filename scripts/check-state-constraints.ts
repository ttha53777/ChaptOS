import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const checks = [
    { label: "AttendanceExcuse.status",  sql: `SELECT count(*) FROM "AttendanceExcuse" WHERE "status" NOT IN ('pending','approved','rejected')` },
    { label: "Transaction.type",          sql: `SELECT count(*) FROM "Transaction" WHERE "type" NOT IN ('income','expense')` },
    { label: "PartyEvent.partyType",      sql: `SELECT count(*) FROM "PartyEvent" WHERE "partyType" NOT IN ('Open','Closed')` },
    { label: "ActivityLog.type",          sql: `SELECT count(*) FROM "ActivityLog" WHERE "type" NOT IN ('success','warning','info')` },
    { label: "CalendarEvent.category",    sql: `SELECT count(*) FROM "CalendarEvent" WHERE "category" NOT IN ('chapter','social','fundy','program','party','deadline','service')` },
  ];
  for (const c of checks) {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(c.sql);
    const n = Number(rows[0].count);
    console.log(`${c.label}: ${n} violations${n > 0 ? " ❌" : " ✓"}`);
  }
}
main().finally(() => prisma.$disconnect());
