/**
 * Test-scoped Prisma client. Connects to TEST_DATABASE_URL set by global setup.
 *
 * Each test file imports this client and uses it for seeding and assertions.
 * Tests truncate tables between runs (see resetDb) for hard isolation.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../app/generated/prisma/client";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://figurints_test:figurints_test@localhost:54330/figurints_test?schema=public";

const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
export const testPrisma = new PrismaClient({ adapter });

/**
 * Truncate every domain table in the right order. Restart identity so test
 * runs start at id=1 — predictable assertions.
 *
 * Order matters: leaf tables first, organizations last.
 */
export async function resetDb(): Promise<void> {
  await testPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "OperationalEvent",
      "ActivityLog",
      "AttendanceRecord",
      "AttendanceExcuse",
      "BudgetAllocation",
      "Budget",
      "TransactionCalendarEvent",
      "Reimbursement",
      "Transaction",
      "ChapterAnnouncement",
      "ProgrammingChecklistItem",
      "ProgrammingEventDoc",
      "ProgrammingEvent",
      "Doc",
      "InstagramTask",
      "TaskAssignment",
      "Task",
      "ServiceParticipation",
      "ServiceEvent",
      "CalendarEvent",
      "PartyEvent",
      "BrotherMetricValue",
      "OrgMetricDefinition",
      "BrotherRole",
      "Role",
      "Semester",
      "InviteRedemption",
      "OrgInvite",
      "Membership",
      "PlatformAdmin",
      "Brother",
      "OrganizationConfig",
      "Organization"
    RESTART IDENTITY CASCADE;
  `);
}
