import { config } from "dotenv";

// Load .env.local before anything reads DATABASE_URL
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { brothers, tasks, instagramTasks, partyEvents, calendarEvents, seedActivity, seedTransactions } from "../app/data";
import { recalcBrotherAttendance } from "../lib/attendance";
import { db } from "../lib/db";
import { seedSystemRoles, assignSystemRolesByTitle } from "../lib/seed-roles";
import { BUILTIN_EVENT_TYPES } from "../lib/event-types";

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

const ORG_ID = 1;

async function main() {
  // Guard: everything below is createMany with no natural-key dedupe, so a
  // re-run multiplies every row (this happened — 3× events/deadlines/txs).
  // Refuse to seed into an org that already has data; FORCE_RESEED=1 overrides
  // for someone who has wiped the org manually and knows what they're doing.
  const existing = await prisma.brother.count({ where: { organizationId: ORG_ID } });
  if (existing > 0 && process.env.FORCE_RESEED !== "1") {
    console.error(
      `Org ${ORG_ID} already has ${existing} brothers — re-seeding would duplicate every row. ` +
      `Aborting. Set FORCE_RESEED=1 to override (only after manually clearing the org's data).`,
    );
    process.exit(1);
  }

  // Ensure the seed org exists (idempotent)
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: "Lambda Phi Epsilon", slug: "lpe" },
  });

  // Built-in timeline event types (provisionOrg seeds these for real orgs; the
  // seed org is created directly, so mirror it here). skipDuplicates keeps it
  // idempotent against the (organizationId, slug) unique.
  await prisma.calendarEventType.createMany({
    skipDuplicates: true,
    data: BUILTIN_EVENT_TYPES.map((t, i) => ({
      organizationId:   ORG_ID,
      slug:             t.slug,
      label:            t.label,
      color:            t.color,
      colorDark:        t.colorDark,
      workflowId:       t.workflowId,
      builtin:          true,
      creatable:        t.creatable,
      hidden:           false,
      mandatoryDefault: t.mandatoryDefault,
      displayOrder:     i,
    })),
  });

  // LPE's own vocabulary: social/fundy/program are CUSTOM types here (they were
  // demoted from the built-in registry — LPE words, not platform words). The
  // seeded programming/calendar events below reference these slugs.
  const LPE_CUSTOM_EVENT_TYPES = [
    { slug: "social",  label: "Social",     color: "#9a7224", colorDark: "#ddb36a" },
    { slug: "fundy",   label: "Fundraiser", color: "#4a7d4c", colorDark: "#86b988" },
    { slug: "program", label: "Program",    color: "#6d28d9", colorDark: "#a78bfa" },
  ];
  await prisma.calendarEventType.createMany({
    skipDuplicates: true,
    data: LPE_CUSTOM_EVENT_TYPES.map((t, i) => ({
      organizationId:   ORG_ID,
      slug:             t.slug,
      label:            t.label,
      color:            t.color,
      colorDark:        t.colorDark,
      workflowId:       null,
      builtin:          false,
      creatable:        true,
      hidden:           false,
      mandatoryDefault: false,
      displayOrder:     BUILTIN_EVENT_TYPES.length + i,
    })),
  });

  // Strip `id` so Prisma autoincrement generates its own IDs — avoids sequence conflicts

  const brotherData = brothers.map(({ id: _id, ...rest }) => ({ ...rest, organizationId: ORG_ID }));
  const createdBrothers = await prisma.brother.createManyAndReturn({ data: brotherData });
  console.log(`Seeded ${brotherData.length} brothers.`);

  // Seed Membership rows for each brother
  await prisma.membership.createMany({
    data: createdBrothers.map(b => ({ brotherId: b.id, organizationId: ORG_ID, isOrgAdmin: b.isAdmin })),
  });

  // Seed tasks (all dated = deadlines), each assigned to a rotating brother so
  // the roster has a visible owner. Strip the client-only fields (assignments,
  // createdAt string) from the mock shape before the DB create.
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const owner = createdBrothers[i % createdBrothers.length];
    const created = await prisma.task.create({
      data: {
        organizationId: ORG_ID,
        title:   t.title,
        dueDate: t.dueDate,
        status:  t.status,
        notes:   t.notes,
      },
    });
    await prisma.taskAssignment.create({
      data: { taskId: created.id, organizationId: ORG_ID, brotherId: owner.id },
    });
  }
  console.log(`Seeded ${tasks.length} tasks.`);

  const igData = instagramTasks.map(({ id: _id, ...rest }) => ({ ...rest, organizationId: ORG_ID }));
  await prisma.instagramTask.createMany({ data: igData });
  console.log(`Seeded ${igData.length} instagram tasks.`);

  const partyData = partyEvents.map(({ id: _id, ...rest }) => ({ ...rest, organizationId: ORG_ID }));
  await prisma.partyEvent.createMany({ data: partyData });
  console.log(`Seeded ${partyData.length} party events.`);

  const calData = calendarEvents.map(({ id: _id, ...rest }) => ({ ...rest, organizationId: ORG_ID }));
  const createdEvents = await prisma.calendarEvent.createManyAndReturn({ data: calData });
  console.log(`Seeded ${calData.length} calendar events.`);

  // Strip both `id` and `timestamp` — DB generates timestamp via @default(now())
  const activityData = seedActivity.map(({ id: _id, timestamp: _ts, ...rest }) => ({ ...rest, organizationId: ORG_ID }));
  await prisma.activityLog.createMany({ data: activityData });
  console.log(`Seeded ${activityData.length} activity entries.`);

  const txData = seedTransactions.map(t => ({ ...t, organizationId: ORG_ID }));
  await prisma.transaction.createMany({ data: txData });
  console.log(`Seeded ${txData.length} transactions.`);

  // ── Semester ──────────────────────────────────────────────────────────────

  const semester = await prisma.semester.upsert({
    where: { organizationId_label: { organizationId: ORG_ID, label: "SPR26" } },
    update: {},
    create: { organizationId: ORG_ID, label: "SPR26", startDate: "2026-01-01", endDate: "2026-06-30", isActive: true },
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
      organizationId: ORG_ID,
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
    const ratio = await recalcBrotherAttendance(db(ORG_ID), brother.id, semester.id);
    console.log(`  ${brother.name}: ${ratio}%`);
  }
  console.log("Attendance ratios written back to brothers.");

  // ── System roles + assignment by title ────────────────────────────────────
  // Roles are seeded last so the assignment pass sees the just-created brothers.
  const roleIdByName = await seedSystemRoles(prisma);
  console.log(`Seeded ${roleIdByName.size} system roles.`);
  const { assigned, brothersTouched } = await assignSystemRolesByTitle(prisma, roleIdByName);
  console.log(`Assigned ${assigned} role(s) across ${brothersTouched} brothers (by title match).`);
}

main().finally(() => prisma.$disconnect());
