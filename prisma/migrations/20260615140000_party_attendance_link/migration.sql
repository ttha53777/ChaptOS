-- Link a PartyEvent to an optional backing CalendarEvent that holds the party's
-- member roll. Member attendance for parties reuses the shared AttendanceRecord
-- system (keyed to CalendarEvent); this nullable FK is how a party points at its
-- own attendance-bearing event. Null until the party is first rolled on wrap-up.
--
-- Additive + nullable: existing rows are unaffected. ON DELETE SET NULL so
-- deleting the backing event just detaches it (the party row survives).

ALTER TABLE "PartyEvent"
  ADD COLUMN "attendanceEventId" INT;

-- One party per event (and vice-versa): unique so the relation is 1:1.
ALTER TABLE "PartyEvent"
  ADD CONSTRAINT "PartyEvent_attendanceEventId_key" UNIQUE ("attendanceEventId");

ALTER TABLE "PartyEvent"
  ADD CONSTRAINT "PartyEvent_attendanceEventId_fkey"
  FOREIGN KEY ("attendanceEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL;

-- App-role grants: PartyEvent already has table-level SELECT/INSERT/UPDATE/DELETE
-- for figurints_app from earlier migrations; the new column is covered by the
-- table grant. No new table, no new sequence → no sequence grant needed.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PartyEvent" TO figurints_app;
  END IF;
END $$;
