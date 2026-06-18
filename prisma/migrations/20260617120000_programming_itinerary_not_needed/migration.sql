-- Add itineraryNotNeeded flag to ProgrammingEvent.
--
-- Lets the itinerary prep item be checked off ("not needed for this event")
-- without an actual attachment, mirroring how roomStatus = 'na' counts as done.
-- The prep score treats the itinerary as done when a file is attached OR this
-- flag is set.

ALTER TABLE "ProgrammingEvent"
  ADD COLUMN "itineraryNotNeeded" BOOLEAN NOT NULL DEFAULT false;

-- App-role grant for completeness (table-level grants already exist; this covers
-- the new column on stricter Postgres versions).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "ProgrammingEvent" TO figurints_app;
  END IF;
END $$;

-- No new sequence: no new table, the column is a plain scalar.
