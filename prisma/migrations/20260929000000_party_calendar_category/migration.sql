-- Party is a normal timeline category with an attached party ledger.
-- Run using the migration role (BYPASSRLS), as with other cross-org backfills.
UPDATE "CalendarEventType" SET "creatable" = true WHERE "slug" = 'party';

-- Existing attendance links are authoritative. Never match by title: two
-- separate parties can share a name, even on the same date.
UPDATE "CalendarEvent" AS event
SET "title" = party."name", "date" = party."date", "category" = 'party'
FROM "PartyEvent" AS party
WHERE party."attendanceEventId" = event."id"
  AND party."organizationId" = event."organizationId";

DO $$
DECLARE party RECORD; event_id INTEGER;
BEGIN
  FOR party IN SELECT * FROM "PartyEvent" WHERE "attendanceEventId" IS NULL LOOP
    INSERT INTO "CalendarEvent" ("organizationId", "title", "date", "category", "mandatory")
    VALUES (party."organizationId", party."name", party."date", 'party', false)
    RETURNING "id" INTO event_id;
    UPDATE "PartyEvent" SET "attendanceEventId" = event_id WHERE "id" = party."id";
  END LOOP;
END $$;

-- Legacy standalone party-category events gain a ledger without changing any
-- schedule, description, attendance record, or calendar identity.
INSERT INTO "PartyEvent" ("organizationId", "name", "date", "attendanceEventId")
SELECT event."organizationId", event."title", event."date", event."id"
FROM "CalendarEvent" AS event
WHERE event."category" = 'party'
  AND NOT EXISTS (SELECT 1 FROM "PartyEvent" AS party WHERE party."attendanceEventId" = event."id");
