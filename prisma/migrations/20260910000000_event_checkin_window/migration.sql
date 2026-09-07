-- Live check-in window on CalendarEvent.
--
-- An officer opens the window from the room ("checkInOpenedAt = now()"), members
-- tap themselves present while it is open, and closing it is the write that turns
-- everyone who never tapped into a recorded absence. There is no scheduled open:
-- CalendarEvent.date is a String and CalendarEvent.time is free text an officer
-- types, so nothing on this model is a computable start instant.
--
-- The *ById columns are deliberately plain INTs rather than FKs to Brother,
-- mirroring AttendanceExcuse.decidedById — deleting the officer who opened a
-- window must not block or cascade into the event's attendance history.
--
-- Additive + nullable: every existing row reads as "never opened".

ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "checkInOpenedAt"   TIMESTAMP(3);
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "checkInOpenedById" INT;
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "checkInClosedAt"   TIMESTAMP(3);
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "checkInClosedById" INT;

-- The live lookup runs on every dashboard load and asks one question: does this
-- org have a recently-opened window? Kept a plain (non-partial) index so it is
-- exactly what @@index in schema.prisma declares — Prisma cannot express a
-- WHERE clause, and a partial index here would read as permanent schema drift.
CREATE INDEX IF NOT EXISTS "CalendarEvent_organizationId_checkInOpenedAt_idx"
  ON "CalendarEvent" ("organizationId", "checkInOpenedAt");

-- App-role grants: CalendarEvent already carries table-level SELECT/INSERT/
-- UPDATE/DELETE for figurints_app, and new columns are covered by the table
-- grant. No new table → no RLS policy and no sequence grant needed.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "CalendarEvent" TO figurints_app;
  END IF;
END $$;
