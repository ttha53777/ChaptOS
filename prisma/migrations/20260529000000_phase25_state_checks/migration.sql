-- Phase 2.5: DB-side CHECK constraints for status-like String fields.
-- Idempotent: skips if constraint already exists.
--
-- Why CHECK, not Prisma `enum`: enum types in Postgres require DROP-and-recreate
-- to add or rename values. The Phase 3 workflow registry will need to add
-- per-org statuses at runtime, which enums can't support without destructive
-- DDL. CHECK constraints can be replaced cheaply (DROP + ADD in one tx).
--
-- Fields covered (only those with stable, known values today):
--   AttendanceExcuse.status   pending | approved | rejected
--   Transaction.type          income  | expense
--   PartyEvent.partyType      Open    | Closed
--   ActivityLog.type          success | warning | info
--   CalendarEvent.category    chapter | social | fundy | program | party | deadline | service
--
-- Deliberately NOT covered (values not yet stable):
--   Deadline.status, InstagramTask.status — revisit in Phase 3.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceExcuse_status_check') THEN
    ALTER TABLE "AttendanceExcuse" ADD CONSTRAINT "AttendanceExcuse_status_check"
      CHECK ("status" IN ('pending','approved','rejected'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_type_check') THEN
    ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_type_check"
      CHECK ("type" IN ('income','expense'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartyEvent_partyType_check') THEN
    ALTER TABLE "PartyEvent" ADD CONSTRAINT "PartyEvent_partyType_check"
      CHECK ("partyType" IN ('Open','Closed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActivityLog_type_check') THEN
    ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_type_check"
      CHECK ("type" IN ('success','warning','info'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarEvent_category_check') THEN
    ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_category_check"
      CHECK ("category" IN ('chapter','social','fundy','program','party','deadline','service'));
  END IF;
END $$;
