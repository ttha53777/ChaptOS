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
      "StripeEvent",
      -- Global, no FK to Organization by design (the org is deleted moments
      -- after the row is written), so nothing cascades it away for us and it has
      -- to be truncated explicitly or rows leak between test files.
      "OrphanedSubscription",
      "SalesLead",
      "Subscription",
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
      "ProgrammingEventDoc",
      "ProgrammingEvent",
      // The org's optional-field vocabulary. Nothing cascades it away (it hangs
      // off Organization, truncated last), so leaving it out leaks definitions
      // between test files and listEventFields returns the seeded ten plus
      // whatever the previous file created.
      "EventFieldDefinition",
      "Doc",
      "DocFolder",
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
      -- Before OrgInvite: JoinRequest FKs the invite it came through. Leaving it
      -- out leaks pending requests between test files, and the
      -- @@unique(organizationId, authUserId) then turns the next submit into a
      -- surprise "already pending".
      "JoinRequest",
      "OrgInvite",
      "Membership",
      "PlatformAdmin",
      "Brother",
      "OrganizationConfig",
      "Organization"
    RESTART IDENTITY CASCADE;
  `);
}
