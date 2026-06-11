-- Programming event ops matrix: operational fields live in a 1:1 extension table.

CREATE TABLE IF NOT EXISTS "ProgrammingEvent" (
  "id"              SERIAL PRIMARY KEY,
  "organizationId"  INTEGER NOT NULL,
  "calendarEventId" INTEGER NOT NULL UNIQUE,
  "owner"           TEXT NOT NULL DEFAULT '',
  "collabOrg"       TEXT NOT NULL DEFAULT '',
  "itineraryUrl"    TEXT,
  "roomStatus"      TEXT NOT NULL DEFAULT 'not_submitted',
  "flyerPosted"     BOOLEAN NOT NULL DEFAULT false,
  "socialsMeeting"  BOOLEAN NOT NULL DEFAULT false,
  "spendingCents"   INTEGER NOT NULL DEFAULT 0,
  "successRating"   INTEGER,
  "wrapUpNotes"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammingEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammingEvent_calendarEventId_fkey"
    FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProgrammingEvent_roomStatus_check"
    CHECK ("roomStatus" IN ('na','not_submitted','submitted','confirmed')),
  CONSTRAINT "ProgrammingEvent_successRating_check"
    CHECK ("successRating" IS NULL OR ("successRating" >= 1 AND "successRating" <= 5))
);

CREATE INDEX IF NOT EXISTS "ProgrammingEvent_organizationId_calendarEventId_idx"
  ON "ProgrammingEvent"("organizationId", "calendarEventId");

CREATE TABLE IF NOT EXISTS "ProgrammingEventDoc" (
  "id"                 SERIAL PRIMARY KEY,
  "organizationId"     INTEGER NOT NULL,
  "programmingEventId" INTEGER NOT NULL,
  "docId"              INTEGER NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammingEventDoc_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProgrammingEventDoc_programmingEventId_fkey"
    FOREIGN KEY ("programmingEventId") REFERENCES "ProgrammingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProgrammingEventDoc_docId_fkey"
    FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProgrammingEventDoc_programmingEventId_docId_key"
  ON "ProgrammingEventDoc"("programmingEventId", "docId");
CREATE INDEX IF NOT EXISTS "ProgrammingEventDoc_organizationId_programmingEventId_idx"
  ON "ProgrammingEventDoc"("organizationId", "programmingEventId");
CREATE INDEX IF NOT EXISTS "ProgrammingEventDoc_organizationId_docId_idx"
  ON "ProgrammingEventDoc"("organizationId", "docId");

-- Backfill a ProgrammingEvent extension row for existing programming categories.
INSERT INTO "ProgrammingEvent" ("organizationId", "calendarEventId", "owner", "collabOrg")
SELECT
  "organizationId",
  "id",
  COALESCE("owner", ''),
  CASE
    WHEN "title" ~ ' × \(.+\)$' THEN TRIM(SUBSTRING("title" FROM '× \((.+)\)$'))
    ELSE ''
  END
FROM "CalendarEvent"
WHERE "category" IN ('program', 'social', 'fundy', 'service')
ON CONFLICT ("calendarEventId") DO NOTHING;

-- Strip legacy collab suffix from CalendarEvent.title once the extension owns it.
UPDATE "CalendarEvent"
SET "title" = TRIM(SUBSTRING("title" FROM '^(.+?) × \(.+\)$'))
WHERE "title" ~ ' × \(.+\)$'
  AND "category" IN ('program', 'social', 'fundy', 'service');
