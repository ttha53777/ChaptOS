import { config } from "dotenv";

// Load .env.local before anything reads DATABASE_URL
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { brothers, deadlines, instagramTasks, partyEvents, calendarEvents, seedActivity } from "../app/data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Strip `id` so Prisma autoincrement generates its own IDs — avoids sequence conflicts

  const brotherData = brothers.map(({ id: _id, ...rest }) => rest);
  await prisma.brother.createMany({ data: brotherData });
  console.log(`Seeded ${brotherData.length} brothers.`);

  const deadlineData = deadlines.map(({ id: _id, ...rest }) => rest);
  await prisma.deadline.createMany({ data: deadlineData });
  console.log(`Seeded ${deadlineData.length} deadlines.`);

  const igData = instagramTasks.map(({ id: _id, ...rest }) => rest);
  await prisma.instagramTask.createMany({ data: igData });
  console.log(`Seeded ${igData.length} instagram tasks.`);

  const partyData = partyEvents.map(({ id: _id, ...rest }) => rest);
  await prisma.partyEvent.createMany({ data: partyData });
  console.log(`Seeded ${partyData.length} party events.`);

  const calData = calendarEvents.map(({ id: _id, ...rest }) => rest);
  await prisma.calendarEvent.createMany({ data: calData });
  console.log(`Seeded ${calData.length} calendar events.`);

  // Strip both `id` and `timestamp` — DB generates timestamp via @default(now())
  const activityData = seedActivity.map(({ id: _id, timestamp: _ts, ...rest }) => rest);
  await prisma.activityLog.createMany({ data: activityData });
  console.log(`Seeded ${activityData.length} activity entries.`);
}

main().finally(() => prisma.$disconnect());
