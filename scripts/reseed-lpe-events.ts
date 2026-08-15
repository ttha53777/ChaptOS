/**
 * Reseed LPE programming events for testing.
 * Safe to run repeatedly — deletes all ProgrammingEvent rows for org 1, then inserts fresh ones.
 * Usage:  npx tsx scripts/reseed-lpe-events.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ORG_ID = 1;
const TODAY = "2026-06-17";

// ── Seed data ────────────────────────────────────────────────────────────────

const DONE_EVENTS = [
  {
    title: "Spring Welcome Night",
    date: "2026-01-22",
    category: "social",
    stage: "done",
    location: "Chapter House",
    time: "7:00 PM",
    owner: "Noah Kim",
    collabOrg: "",
    spendingCents: 12000,
    successRating: 4,
    wrapUpNotes: "Great turnout — 40+ attendees. Add more food next time.",
    mandatory: false,
  },
  {
    title: "Blood Drive",
    date: "2026-02-05",
    category: "service",
    stage: "done",
    location: "Union Hall",
    time: "10:00 AM",
    owner: "Dariel Milfort",
    collabOrg: "Red Cross",
    spendingCents: 0,
    successRating: 5,
    wrapUpNotes: "24 pints collected — best chapter total ever.",
    mandatory: true,
  },
  {
    title: "Lunar New Year Fundraiser",
    date: "2026-02-14",
    category: "fundy",
    stage: "done",
    location: "Student Plaza",
    time: "11:00 AM",
    owner: "Bryan Lee",
    collabOrg: "Asian Student Union",
    spendingCents: 8500,
    successRating: 4,
    wrapUpNotes: "Raised ~$680. Dumplings sold out by noon.",
    mandatory: false,
  },
  {
    title: "Study & Grind Session",
    date: "2026-03-01",
    category: "program",
    stage: "done",
    location: "Library Room 204",
    time: "6:00 PM",
    owner: "Issac Chong",
    collabOrg: "",
    spendingCents: 1500,
    successRating: 3,
    wrapUpNotes: "Low energy mid-semester. Consider a snack budget.",
    mandatory: false,
  },
  {
    title: "Alumni & Brothers Mixer",
    date: "2026-03-20",
    category: "social",
    stage: "done",
    location: "Rooftop Lounge",
    time: "6:30 PM",
    owner: "Thalha Thabish",
    collabOrg: "",
    spendingCents: 22000,
    successRating: 5,
    wrapUpNotes: "12 alumni connected. Strong networking all night.",
    mandatory: false,
  },
  {
    title: "Boba Fundraiser",
    date: "2026-04-10",
    category: "fundy",
    stage: "done",
    location: "Student Union Plaza",
    time: "12:00 PM",
    owner: "Rinchen Sherpalama",
    collabOrg: "Pi Delta Psi",
    spendingCents: 5500,
    successRating: 4,
    wrapUpNotes: "Sold 120 cups. Profit ~$460. Good collab with Pi Delta.",
    mandatory: false,
  },
  {
    title: "Mental Health Walk",
    date: "2026-04-25",
    category: "service",
    stage: "done",
    location: "Campus Quad",
    time: "9:00 AM",
    owner: "Elvin De La Cruz",
    collabOrg: "Counseling Center",
    spendingCents: 3000,
    successRating: 5,
    wrapUpNotes: "35 brothers participated. Excellent visibility for chapter.",
    mandatory: true,
  },
  {
    title: "Car Wash Fundraiser",
    date: "2026-05-03",
    category: "fundy",
    stage: "done",
    location: "Parking Lot C",
    time: "10:00 AM",
    owner: "Jacob Hwang",
    collabOrg: "",
    spendingCents: 2000,
    successRating: 3,
    wrapUpNotes: "Profit $320. Weather was rough — reschedule for fall.",
    mandatory: false,
  },
  {
    title: "End-of-Semester Social",
    date: "2026-05-15",
    category: "social",
    stage: "done",
    location: "Chapter House Backyard",
    time: "5:00 PM",
    owner: "Arijit Das",
    collabOrg: "",
    spendingCents: 18000,
    successRating: 5,
    wrapUpNotes: "Best turnout of the year. BBQ + pool, great vibe.",
    mandatory: false,
  },
  {
    title: "Spring Banquet",
    date: "2026-05-30",
    category: "program",
    stage: "done",
    location: "Grand Ballroom, Union",
    time: "6:00 PM",
    owner: "Bryan Lee",
    collabOrg: "",
    spendingCents: 55000,
    successRating: 5,
    wrapUpNotes: "Awards ceremony + dinner. Formal attire turnout exceeded expectations.",
    mandatory: true,
  },
  {
    title: "Leadership Retreat",
    date: "2026-06-07",
    category: "program",
    stage: "done",
    location: "Mountain View Lodge",
    time: "9:00 AM",
    owner: "Nathaniel Baccarey",
    collabOrg: "",
    spendingCents: 34000,
    successRating: 4,
    wrapUpNotes: "2-day retreat. Strong bonding. Exec planning for fall locked in.",
    mandatory: false,
  },
] as const;

const CONFIRMED_EVENTS = [
  {
    title: "Summer Kickoff Social",
    date: "2026-06-28",
    category: "social",
    stage: "confirmed",
    location: "Rooftop Lounge, Student Union",
    time: "7:00 PM",
    owner: "Noah Kim",
    collabOrg: "Alpha Kappa Delta Phi",
    spendingCents: 25000,
    successRating: null,
    wrapUpNotes: null,
    mandatory: false,
  },
  {
    title: "IFC Community Service Day",
    date: "2026-07-12",
    category: "service",
    stage: "confirmed",
    location: "City Food Bank",
    time: "8:00 AM",
    owner: "Dariel Milfort",
    collabOrg: "IFC",
    spendingCents: 0,
    successRating: null,
    wrapUpNotes: null,
    mandatory: true,
  },
  {
    title: "Summer Trivia Night Fundraiser",
    date: "2026-07-19",
    category: "fundy",
    stage: "confirmed",
    location: "Red Room Bar & Lounge",
    time: "8:00 PM",
    owner: "Jacob Hwang",
    collabOrg: "Lambda Theta Alpha",
    spendingCents: 7500,
    successRating: null,
    wrapUpNotes: null,
    mandatory: false,
  },
] as const;

const PLANNING_EVENTS = [
  {
    title: "Fall Rush Info Night",
    date: "2026-08-25",
    category: "program",
    stage: "planning",
    location: "TBD",
    time: "7:30 PM",
    owner: "Bryan Lee",
    collabOrg: "",
    spendingCents: 15000,
    successRating: null,
    wrapUpNotes: null,
    mandatory: false,
  },
  {
    title: "Academic Kickoff Workshop",
    date: "2026-08-30",
    category: "program",
    stage: "planning",
    location: "Library Room 301",
    time: "5:00 PM",
    owner: "Issac Chong",
    collabOrg: "Academic Affairs",
    spendingCents: 2500,
    successRating: null,
    wrapUpNotes: null,
    mandatory: false,
  },
  {
    title: "Brothers & Alumni Golf Outing",
    date: "2026-09-06",
    category: "social",
    stage: "planning",
    location: "Sunrise Golf Club",
    time: "8:00 AM",
    owner: "Thalha Thabish",
    collabOrg: "",
    spendingCents: 40000,
    successRating: null,
    wrapUpNotes: null,
    mandatory: false,
  },
] as const;

const IDEA_EVENTS = [
  {
    title: "Karaoke Night",
    date: null,
    category: "social",
    stage: "idea",
    location: "",
    time: null,
    owner: "Rinchen Sherpalama",
    collabOrg: "",
    spendingCents: 0,
    successRating: null,
    wrapUpNotes: null,
    mandatory: false,
  },
  {
    title: "Alumni Speaker Series",
    date: null,
    category: "program",
    stage: "idea",
    location: "",
    time: null,
    owner: "Elvin De La Cruz",
    collabOrg: "",
    spendingCents: 0,
    successRating: null,
    wrapUpNotes: null,
    mandatory: false,
  },
  {
    title: "Campus Cleanup Drive",
    date: null,
    category: "service",
    stage: "idea",
    location: "",
    time: null,
    owner: "Arijit Das",
    collabOrg: "",
    spendingCents: 0,
    successRating: null,
    wrapUpNotes: null,
    mandatory: false,
  },
  {
    title: "Basketball Tournament",
    date: null,
    category: "social",
    stage: "idea",
    location: "",
    time: null,
    owner: "Jacob Hwang",
    collabOrg: "Sigma Chi",
    spendingCents: 0,
    successRating: null,
    wrapUpNotes: null,
    mandatory: false,
  },
] as const;

function categoryToCalCategory(category: string): string {
  return category; // fundy, social, service, program are identical in both tables
}

async function main() {
  console.log("Cleaning up existing ProgrammingEvent + orphaned CalendarEvent rows for org 1…");

  // Collect calendarEventIds linked to existing programming events.
  const existing = await prisma.programmingEvent.findMany({
    where: { organizationId: ORG_ID },
    select: { id: true, calendarEventId: true },
  });
  const calIds = existing.map(e => e.calendarEventId).filter(Boolean) as number[];

  if (existing.length > 0) {
    // The check constraint (stage = 'idea' OR calendarEventId IS NOT NULL) fires on
    // UPDATE too. Demote + null the FK atomically via raw SQL, then delete.
    await prisma.$executeRaw`
      UPDATE "ProgrammingEvent"
      SET "stage" = 'idea', "calendarEventId" = NULL
      WHERE "organizationId" = ${ORG_ID}
    `;
    const { count: delPE } = await prisma.programmingEvent.deleteMany({ where: { organizationId: ORG_ID } });
    console.log(`  Deleted ${delPE} ProgrammingEvent rows.`);
  }

  if (calIds.length > 0) {
    // Delete service events that were linked to those calendar events first.
    await prisma.serviceEvent.deleteMany({ where: { calendarEventId: { in: calIds } } });
    const { count: delCal } = await prisma.calendarEvent.deleteMany({ where: { id: { in: calIds } } });
    console.log(`  Deleted ${delCal} linked CalendarEvent rows.`);
  }

  // The publish boundary is CONFIRMED now, not Planning. Planning events are a
  // private lane with no CalendarEvent, so they seed alongside the ideas.
  const calendarBacked = [...DONE_EVENTS, ...CONFIRMED_EVENTS];
  const unpublished = [...PLANNING_EVENTS, ...IDEA_EVENTS];

  // Owner is a roster FK now, not a free-text name. Resolve the seed's names
  // against this org's Membership rows (the name an org actually uses); anything
  // unmatched seeds as an unowned event rather than inventing a member.
  const roster = await prisma.membership.findMany({
    where: { organizationId: ORG_ID },
    select: { brotherId: true, name: true, brother: { select: { name: true } } },
  });
  const brotherIdByName = new Map(
    roster.map(m => [(m.name ?? m.brother.name).toLowerCase(), m.brotherId] as const),
  );
  const ownerIdFor = (name: string) => brotherIdByName.get(name.trim().toLowerCase()) ?? null;

  let seeded = 0;

  // Calendar-backed events: create CalendarEvent first, then ProgrammingEvent.
  // Prisma inserts FKs in a second statement which trips the check constraint
  // (stage != 'idea' BUT calendarEventId still null at insert time). Workaround:
  // insert the PE as stage='idea' (passes the null check), then immediately update
  // to set calendarEventId + real stage in one statement.
  for (const e of calendarBacked) {
    const cal = await prisma.calendarEvent.create({
      data: {
        organizationId: ORG_ID,
        title: e.title,
        date: e.date!,
        time: e.time ?? null,
        category: categoryToCalCategory(e.category),
        mandatory: e.mandatory,
        location: e.location || null,
      },
    });
    const pe = await prisma.programmingEvent.create({
      data: {
        organizationId: ORG_ID,
        title: e.title,
        date: e.date,
        category: e.category,
        stage: "idea", // placeholder — constraint allows null calendarEventId for idea
        location: e.location || null,
        time: e.time ?? null,
        ownerBrotherId: ownerIdFor(e.owner),
        collabOrg: e.collabOrg,
        status: "Upcoming",
        mandatory: e.mandatory,
        spendingCents: e.spendingCents,
        successRating: e.successRating ?? null,
        wrapUpNotes: e.wrapUpNotes ?? null,
        description: null,
        attachmentUrl: null,
        attachmentDocId: null,
      },
    });
    // Now set the real stage + calendarEventId together via raw SQL so the check
    // sees both columns at once (both non-null → constraint passes).
    await prisma.$executeRaw`
      UPDATE "ProgrammingEvent"
      SET "calendarEventId" = ${cal.id}, "stage" = ${e.stage}
      WHERE "id" = ${pe.id}
    `;
    seeded++;
  }

  // Ideas and Planning: ProgrammingEvent only, no CalendarEvent — neither lane
  // publishes to the chapter any more. Planning keeps its date and location where
  // the seed gave it one; that is exactly what makes it confirmable.
  await prisma.programmingEvent.createMany({
    data: unpublished.map(e => ({
      organizationId: ORG_ID,
      title: e.title,
      date: "date" in e ? (e.date as string | null) : null,
      category: e.category,
      stage: e.stage,
      location: "location" in e ? ((e.location as string) || null) : null,
      time: "time" in e ? ((e.time as string | undefined) ?? null) : null,
      ownerBrotherId: ownerIdFor(e.owner),
      collabOrg: e.collabOrg,
      status: "Upcoming",
      mandatory: "mandatory" in e ? Boolean(e.mandatory) : false,
      spendingCents: 0,
      successRating: null,
      wrapUpNotes: null,
      description: null,
      attachmentUrl: null,
      attachmentDocId: null,
    })),
  });
  seeded += unpublished.length;

  console.log(`\nSeeded ${seeded} programming events:`);
  console.log(`  ${DONE_EVENTS.length} done, ${CONFIRMED_EVENTS.length} confirmed, ${PLANNING_EVENTS.length} planning, ${IDEA_EVENTS.length} ideas`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
