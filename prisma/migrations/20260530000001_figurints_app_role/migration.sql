-- Grant table-level permissions to the figurints_app role.
--
-- figurints_app is a NOSUPERUSER NOBYPASSRLS role that the app uses in
-- production instead of the postgres superuser. Because it lacks BYPASSRLS,
-- the Phase 2.5 org_isolation policies become the active second enforcement
-- layer.
--
-- CREATE ROLE cannot run inside a Prisma migration on Supabase (requires
-- superuser). Run the one-time setup below in the Supabase SQL editor FIRST,
-- then apply this migration:
--
--   CREATE ROLE figurints_app
--     NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
--     NOBYPASSRLS LOGIN
--     PASSWORD '<use a strong password, store in Supabase secrets>';
--
-- After applying this migration, update DATABASE_URL in your environment to:
--   postgresql://figurints_app:<password>@<host>:6543/postgres
--
-- DIRECT_URL (used by prisma migrate) must continue pointing to the postgres
-- superuser so migrations can run.

-- Core domain tables — CRUD
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Brother",
  "Role",
  "BrotherRole",
  "Semester",
  "CalendarEvent",
  "AttendanceRecord",
  "AttendanceExcuse",
  "Deadline",
  "InstagramTask",
  "Doc",
  "PartyEvent",
  "ServiceEvent",
  "Transaction",
  "Budget",
  "BudgetAllocation",
  "ActivityLog",
  "OperationalEvent",
  "ChapterAnnouncement"
TO figurints_app;

-- Global / auth tables — read + targeted writes
GRANT SELECT ON "Organization", "PlatformAdmin" TO figurints_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Membership" TO figurints_app;

-- Sequences (needed for autoincrement inserts)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO figurints_app;
