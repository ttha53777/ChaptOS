/**
 * Seed the /lpe (org 1) docs page with a rich, demo-ready reference library.
 *
 * "Replace junk, keep real": deletes only the test-junk docs/folders, preserves
 * the three real docs (Constitution, Treasury, Chapter Directory), and layers a
 * curated set of mock folders + docs around them — across every kind the page
 * renders (Doc / Sheet / Form / Link), with a few pinned and attribution to real
 * chapter members.
 *
 * Safe to re-run: it removes any doc/folder it previously seeded (matched by the
 * SEED_TAG marker on folder names and by known mock URLs) before re-inserting,
 * so running twice doesn't duplicate. The real docs are never touched except to
 * be re-filed into the new Governance folder.
 *
 * Usage:  npx tsx scripts/seed-lpe-docs.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ORG_ID = 1;

// Real docs we keep (by title) and re-file into Governance & Finance.
const KEEP_CONSTITUTION = "UAlbany LphiE Constitution";
const KEEP_TREASURY = "SP26 Treasury";
// "Chapter Directory" (pinned) stays exactly as-is on the shelf.

// Test junk to remove (by title). Folders "Hello"/"SV-Folder" go too.
const JUNK_DOC_TITLES = ["SV-A", "SV-B", "SV-C", "Test"];
const JUNK_FOLDER_NAMES = ["Hello", "SV-Folder"];

// A hidden marker appended to nothing user-visible; we instead identify our own
// seeded rows by their mock URLs (all under these hosts) so re-runs are clean.
const MOCK_DOC_URLS = new Set<string>();

// A couple of real chapter members to attribute docs to (ids from the roster).
const ARIJIT = 1;   // Arijit Das
const BRYAN = 2;     // Bryan Lee
const NOAH = 4;      // Noah Kim
const DARIEL = 7;    // Dariel Milfort

// ── Folder + doc definitions ─────────────────────────────────────────────────
// Folder key → definition. Docs reference their folder by key (or null = Unfiled).

type FolderDef = { key: string; name: string; pinned?: boolean };
const FOLDERS: FolderDef[] = [
  { key: "governance", name: "Governance & Finance", pinned: true },
  { key: "recruitment", name: "Recruitment" },
  { key: "events", name: "Events & Programming" },
  { key: "onboarding", name: "New Member Onboarding" },
  { key: "brand", name: "Brand & Templates" },
];

type DocDef = {
  title: string;
  url: string;
  description: string | null;
  folder: string | null; // folder key, or null for Unfiled
  createdById: number | null;
  pinned?: boolean;
};

const DOCS: DocDef[] = [
  // ── Governance & Finance (also gets the two real docs re-filed here) ──
  {
    title: "Chapter Bylaws (2026 Revision)",
    url: "https://docs.google.com/document/d/1aBcGoVrN0bYlaWs2026Rev/edit",
    description: "The current governing document — amended at the spring general meeting.",
    folder: "governance",
    createdById: BRYAN,
  },
  {
    title: "Exec Board Meeting Minutes",
    url: "https://docs.google.com/document/d/1MinUtesLog2026SpringSem/edit",
    description: "Running log of weekly exec meetings. Add your position's updates before each meeting.",
    folder: "governance",
    createdById: ARIJIT,
  },
  {
    title: "Annual Budget & Dues Tracker",
    url: "https://docs.google.com/spreadsheets/d/1BudGetDuesTracker2026Fy/edit",
    description: "Line-item budget vs. actuals, plus the dues payment tracker.",
    folder: "governance",
    createdById: BRYAN,
    pinned: true,
  },
  {
    title: "Reimbursement Request Form",
    url: "https://forms.gle/ReimburseReqLpe2026",
    description: "Submit receipts here for treasury reimbursement. Include an itemized total.",
    folder: "governance",
    createdById: BRYAN,
  },

  // ── Recruitment ──
  {
    title: "Rush Week Master Plan",
    url: "https://docs.google.com/document/d/1RushWeekMasterPlanFa26/edit",
    description: "Day-by-day schedule, roles, and logistics for fall rush.",
    folder: "recruitment",
    createdById: NOAH,
    pinned: true,
  },
  {
    title: "Interest Form (PNMs)",
    url: "https://forms.gle/RushInterestPnmLpe",
    description: "Public interest form — share the link on socials and at tabling.",
    folder: "recruitment",
    createdById: NOAH,
  },
  {
    title: "PNM Contact Sheet",
    url: "https://docs.google.com/spreadsheets/d/1PnmContactSheetFa26/edit",
    description: "Names, contact info, and follow-up status for prospective members.",
    folder: "recruitment",
    createdById: NOAH,
  },
  {
    title: "Tabling Sign-Up",
    url: "https://docs.google.com/spreadsheets/d/1TablingSignUpFa26Slots/edit",
    description: "Claim your tabling shifts for the quad. Two brothers per slot.",
    folder: "recruitment",
    createdById: DARIEL,
  },

  // ── Events & Programming ──
  {
    title: "Semester Event Calendar",
    url: "https://docs.google.com/spreadsheets/d/1EventCalendarSp26Master/edit",
    description: "Master calendar of socials, service, fundraisers, and programs.",
    folder: "events",
    createdById: NOAH,
  },
  {
    title: "Event Planning Checklist",
    url: "https://docs.google.com/document/d/1EventPlanningChecklistDoc/edit",
    description: "Copy this per event: room booking, flyer, budget, day-of run sheet.",
    folder: "events",
    createdById: ARIJIT,
  },
  {
    title: "Post-Event Feedback Form",
    url: "https://forms.gle/EventFeedbackLpe2026",
    description: "Quick survey we send after each event to gauge turnout and vibe.",
    folder: "events",
    createdById: DARIEL,
  },
  {
    title: "Room Reservation Portal",
    url: "https://ems.albany.edu/reservations",
    description: "University room booking system. Submit at least two weeks ahead.",
    folder: "events",
    createdById: NOAH,
  },

  // ── New Member Onboarding ──
  {
    title: "New Member Handbook",
    url: "https://docs.google.com/document/d/1NewMemberHandbookLpe/edit",
    description: "History, values, expectations, and the new-member timeline.",
    folder: "onboarding",
    createdById: BRYAN,
  },
  {
    title: "Big/Little Preference Form",
    url: "https://forms.gle/BigLittlePrefLpe26",
    description: "New members and bigs both fill this out before matching night.",
    folder: "onboarding",
    createdById: ARIJIT,
  },
  {
    title: "Study Hours Log",
    url: "https://docs.google.com/spreadsheets/d/1StudyHoursLogNmClass/edit",
    description: "New members log required weekly study hours here.",
    folder: "onboarding",
    createdById: ARIJIT,
  },

  // ── Brand & Templates ──
  {
    title: "Logo & Brand Assets",
    url: "https://drive.google.com/drive/folders/1LpeBrandAssetsFolder",
    description: "Logos, colors, and fonts. Use these on all official flyers.",
    folder: "brand",
    createdById: DARIEL,
  },
  {
    title: "Flyer Template (Canva)",
    url: "https://www.canva.com/design/lpe-flyer-template/edit",
    description: "Duplicate this Canva template for a consistent event-flyer look.",
    folder: "brand",
    createdById: DARIEL,
  },
  {
    title: "Instagram Content Calendar",
    url: "https://docs.google.com/spreadsheets/d/1IgContentCalendarLpe/edit",
    description: "Plan and schedule the chapter's social posts.",
    folder: "brand",
    createdById: DARIEL,
  },

  // ── Unfiled (a few loose, pinnable references) ──
  {
    title: "National Fraternity Website",
    url: "https://lambdaphiepsilon.com",
    description: "Lambda Phi Epsilon International — national resources and news.",
    folder: null,
    createdById: ARIJIT,
    pinned: true,
  },
  {
    title: "Chapter Anthem & Traditions",
    url: "https://docs.google.com/document/d/1ChapterTraditionsAnthem/edit",
    description: "Reference for chants, traditions, and chapter history.",
    folder: null,
    createdById: BRYAN,
  },
];

DOCS.forEach(d => MOCK_DOC_URLS.add(d.url));

async function main() {
  const org = await prisma.organization.findUnique({ where: { id: ORG_ID }, select: { name: true, slug: true } });
  if (!org) throw new Error(`Org ${ORG_ID} not found`);
  console.log(`Seeding docs for ${org.name} (/${org.slug})…\n`);

  // ── 1. Remove test junk ──
  const delJunkDocs = await prisma.doc.deleteMany({
    where: { organizationId: ORG_ID, title: { in: JUNK_DOC_TITLES } },
  });
  console.log(`  Deleted ${delJunkDocs.count} junk docs (${JUNK_DOC_TITLES.join(", ")}).`);

  // ── 2. Remove any docs/folders we seeded on a previous run (idempotency) ──
  const delMineDocs = await prisma.doc.deleteMany({
    where: { organizationId: ORG_ID, url: { in: [...MOCK_DOC_URLS] } },
  });
  if (delMineDocs.count) console.log(`  Removed ${delMineDocs.count} previously-seeded mock docs.`);

  // ── 3. Create folders (release + delete the junk folders after re-filing) ──
  //     We create Governance FIRST so we can re-file the two real docs into it,
  //     then delete the "Hello" folder they used to live in.
  const folderIdByKey = new Map<string, number>();
  for (const f of FOLDERS) {
    // Clear any prior seed of this folder (release its docs to Unfiled first).
    const prior = await prisma.docFolder.findFirst({
      where: { organizationId: ORG_ID, name: f.name },
      select: { id: true },
    });
    if (prior) {
      await prisma.doc.updateMany({ where: { folderId: prior.id }, data: { folderId: null } });
      await prisma.docFolder.delete({ where: { id: prior.id } });
    }
    const created = await prisma.docFolder.create({
      data: {
        organizationId: ORG_ID,
        name: f.name,
        pinnedAt: f.pinned ? new Date() : null,
        createdById: BRYAN,
      },
      select: { id: true },
    });
    folderIdByKey.set(f.key, created.id);
  }
  console.log(`  Created ${FOLDERS.length} folders.`);

  // ── 4. Re-file the two real docs into Governance & Finance ──
  const govId = folderIdByKey.get("governance")!;
  const refiled = await prisma.doc.updateMany({
    where: { organizationId: ORG_ID, title: { in: [KEEP_CONSTITUTION, KEEP_TREASURY] } },
    data: { folderId: govId },
  });
  console.log(`  Re-filed ${refiled.count} real docs into Governance & Finance.`);

  // ── 5. Delete the now-empty junk folders (any leftover docs go to Unfiled) ──
  const junkFolders = await prisma.docFolder.findMany({
    where: { organizationId: ORG_ID, name: { in: JUNK_FOLDER_NAMES } },
    select: { id: true, name: true },
  });
  for (const jf of junkFolders) {
    await prisma.doc.updateMany({ where: { folderId: jf.id }, data: { folderId: null } });
    await prisma.docFolder.delete({ where: { id: jf.id } });
  }
  if (junkFolders.length) console.log(`  Deleted ${junkFolders.length} junk folders (${junkFolders.map(f => f.name).join(", ")}).`);

  // ── 6. Insert the mock docs, spread over the last ~5 weeks so the meta-line
  //       ("newest 2d ago", "X added this week") reads naturally. Pinned docs get
  //       a pinnedAt; folder docs get their folder id.
  const now = Date.now();
  let inserted = 0;
  for (let i = 0; i < DOCS.length; i++) {
    const d = DOCS[i];
    // Newest first in the array → most recent createdAt. Space ~2.5 days apart.
    const createdAt = new Date(now - i * 2.5 * 86_400_000);
    await prisma.doc.create({
      data: {
        organizationId: ORG_ID,
        title: d.title,
        url: d.url,
        description: d.description,
        folderId: d.folder ? folderIdByKey.get(d.folder)! : null,
        createdById: d.createdById,
        pinnedAt: d.pinned ? new Date(now - i * 3_600_000) : null,
        createdAt,
      },
    });
    inserted++;
  }
  console.log(`  Inserted ${inserted} mock docs.`);

  // ── Summary ──
  const totalDocs = await prisma.doc.count({ where: { organizationId: ORG_ID } });
  const totalFolders = await prisma.docFolder.count({ where: { organizationId: ORG_ID } });
  const pinned = await prisma.doc.count({ where: { organizationId: ORG_ID, pinnedAt: { not: null } } });
  console.log(`\nDone. /lpe now has ${totalDocs} docs (${pinned} pinned) across ${totalFolders} folders.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
