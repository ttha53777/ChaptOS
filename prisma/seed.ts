import { config } from "dotenv";

// Load .env.local before anything reads DATABASE_URL
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { brothers, deadlines, instagramTasks, partyEvents, calendarEvents, seedActivity, seedTransactions } from "../app/data";
import { recalcBrotherAttendance } from "../lib/attendance";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Target attendance ratios per brother (from data.ts), used to drive seeded records.
// We create enough past mandatory event records so the computed ratio matches approximately.
const TARGET_ATTENDANCE: Record<string, number> = {
  "Arijit Das":        78,
  "Bryan Lee":         95,
  "Issac Chong":       88,
  "Noah Kim":          82,
  "Jacob Hwang":       68,
  "Nathaniel Baccarey":58,
  "Dariel Milfort":    92,
  "Rinchen Sherpalama":87,
  "Elvin De La Cruz":  74,
  "Thalha Thabish":    90,
};

async function main() {
  // Strip `id` so Prisma autoincrement generates its own IDs — avoids sequence conflicts

  const brotherData = brothers.map(({ id: _id, ...rest }) => rest);
  const createdBrothers = await prisma.brother.createManyAndReturn({ data: brotherData });
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
  const createdEvents = await prisma.calendarEvent.createManyAndReturn({ data: calData });
  console.log(`Seeded ${calData.length} calendar events.`);

  // Strip both `id` and `timestamp` — DB generates timestamp via @default(now())
  const activityData = seedActivity.map(({ id: _id, timestamp: _ts, ...rest }) => rest);
  await prisma.activityLog.createMany({ data: activityData });
  console.log(`Seeded ${activityData.length} activity entries.`);

  await prisma.transaction.createMany({ data: seedTransactions });
  console.log(`Seeded ${seedTransactions.length} transactions.`);

  // ── Semester ──────────────────────────────────────────────────────────────

  const semester = await prisma.semester.upsert({
    where: { label: "SPR26" },
    update: {},
    create: { label: "SPR26", startDate: "2026-01-01", endDate: "2026-06-30", isActive: true },
  });
  console.log(`Seeded semester: ${semester.label}`);

  // ── Past mandatory attendance records ─────────────────────────────────────
  // Past mandatory events as of 2026-05-16:
  //   Chapter Meeting 2026-05-12 (data id 101) and Boba Fundraiser 2026-05-14 (data id 301)
  // We seed 10 synthetic "virtual" past events to give each brother a meaningful ratio.
  // Rather than relying on real event IDs, we build a deterministic set of AttendanceRecords
  // using only the two actual past events plus synthetic ones created as past CalendarEvents.

  const TODAY = "2026-05-16";

  // Create 8 synthetic past chapter meetings (spread across Jan–Apr) to fill out history
  const syntheticPastDates = [
    "2026-01-13", "2026-01-27", "2026-02-10", "2026-02-24",
    "2026-03-10", "2026-03-24", "2026-04-07", "2026-04-21",
  ];

  const syntheticEvents = await prisma.calendarEvent.createManyAndReturn({
    data: syntheticPastDates.map(date => ({
      title: "Chapter Meeting",
      date,
      time: "7:00 PM",
      category: "chapter",
      mandatory: true,
      location: "Chapter Room",
    })),
  });
  console.log(`Seeded ${syntheticEvents.length} synthetic past chapter meetings.`);

  // The two real past mandatory events
  const pastMandatoryFromSeed = createdEvents.filter(
    e => e.mandatory && e.date < TODAY
  );

  const allPastMandatory = [...syntheticEvents, ...pastMandatoryFromSeed];
  const totalEvents = allPastMandatory.length; // 10 events

  // For each brother, determine how many events they attended based on target ratio
  // Using deterministic assignment: attend the first N events (sorted by date)
  const sortedEvents = [...allPastMandatory].sort((a, b) => a.date.localeCompare(b.date));

  const recordsToCreate: {
    calendarEventId: number;
    brotherId: number;
    semesterId: number;
    attended: boolean;
  }[] = [];

  for (const brother of createdBrothers) {
    const target = TARGET_ATTENDANCE[brother.name] ?? 80;
    const attendCount = Math.round((target / 100) * totalEvents);

    for (let i = 0; i < sortedEvents.length; i++) {
      recordsToCreate.push({
        calendarEventId: sortedEvents[i].id,
        brotherId: brother.id,
        semesterId: semester.id,
        attended: i < attendCount,
      });
    }
  }

  await prisma.attendanceRecord.createMany({ data: recordsToCreate });
  console.log(`Seeded ${recordsToCreate.length} attendance records.`);

  // Recalculate and write ratios back to Brother.attendance
  for (const brother of createdBrothers) {
    const ratio = await recalcBrotherAttendance(brother.id, semester.id);
    console.log(`  ${brother.name}: ${ratio}%`);
  }
  console.log("Attendance ratios written back to brothers.");
}

main().finally(() => prisma.$disconnect());
