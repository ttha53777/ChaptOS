-- Add single-attachment fields to ProgrammingEvent.
--
-- Replaces the split itineraryUrl + ProgrammingEventDoc join-table approach
-- with two mutually-exclusive nullable columns:
--   attachmentUrl   — raw external URL pasted by the user
--   attachmentDocId — FK to a Resources Doc picked via the / picker
--
-- itineraryUrl stays in place (nulled after backfill) so existing rows keep
-- their data during the rollout window.

ALTER TABLE "ProgrammingEvent"
  ADD COLUMN "attachmentUrl"   TEXT,
  ADD COLUMN "attachmentDocId" INT REFERENCES "Doc"(id) ON DELETE SET NULL;

-- Backfill: promote existing itineraryUrl values into the new column.
UPDATE "ProgrammingEvent"
SET "attachmentUrl" = "itineraryUrl"
WHERE "itineraryUrl" IS NOT NULL AND "itineraryUrl" <> '';

-- App-role column-level grants (SELECT/INSERT/UPDATE already granted on the
-- whole table by the earlier _programming_app_grants migration; we only need
-- to cover the new columns for completeness on stricter Postgres versions).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "ProgrammingEvent" TO figurints_app;
  END IF;
END $$;

-- No new sequence: no new table, both columns are plain scalars / FK.
