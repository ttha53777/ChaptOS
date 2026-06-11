-- Programming stage inversion: make ProgrammingEvent the owning record.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The Programming page is becoming a Kanban planning board (Idea → Planning →
-- Confirmed → Done). Events in the "idea" stage must NOT appear on the shared
-- Calendar/Timeline — they only get a CalendarEvent once promoted to Planning+.
-- Today every ProgrammingEvent REQUIRES a CalendarEvent (calendarEventId is a
-- mandatory unique FK with ON DELETE CASCADE). This migration inverts that:
-- ProgrammingEvent owns title/date/category/etc., calendarEventId becomes
-- nullable, and the FK switches to ON DELETE SET NULL so deleting a calendar
-- entry (from the Timeline) sends the event back to Idea instead of destroying
-- it. Legacy rows all had a CalendarEvent, so they backfill to Confirmed/Done.

-- ── 1. Add new owning columns (nullable/defaulted first; tightened in step 5) ─
ALTER TABLE "ProgrammingEvent"
  ADD COLUMN "title"       TEXT,
  ADD COLUMN "date"        TEXT,
  ADD COLUMN "category"    TEXT,
  ADD COLUMN "location"    TEXT,
  ADD COLUMN "time"        TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "status"      TEXT    NOT NULL DEFAULT 'Upcoming',
  ADD COLUMN "stage"       TEXT    NOT NULL DEFAULT 'idea',
  ADD COLUMN "mandatory"   BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Swap the FK: drop CASCADE, make nullable, re-add as SET NULL ──────────
ALTER TABLE "ProgrammingEvent" DROP CONSTRAINT "ProgrammingEvent_calendarEventId_fkey";
ALTER TABLE "ProgrammingEvent" ALTER COLUMN "calendarEventId" DROP NOT NULL;
ALTER TABLE "ProgrammingEvent" ADD CONSTRAINT "ProgrammingEvent_calendarEventId_fkey"
  FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. Backfill owning fields from the linked CalendarEvent ──────────────────
-- (collabOrg already lives on ProgrammingEvent from 20260611000001, so the
--  CalendarEvent title is already collab-stripped — copy it verbatim.)
UPDATE "ProgrammingEvent" pe
SET "title"       = ce."title",
    "date"        = ce."date",
    "category"    = ce."category",
    "location"    = ce."location",
    "time"        = ce."time",
    "description" = ce."description",
    "status"      = COALESCE(ce."status", 'Upcoming'),
    "mandatory"   = ce."mandatory"
FROM "CalendarEvent" ce
WHERE pe."calendarEventId" = ce."id";

-- Safety net: any orphan PE with no calendar row (shouldn't exist pre-migration)
-- gets a placeholder title so the NOT NULL tighten in step 5 succeeds.
UPDATE "ProgrammingEvent"
SET "title"    = COALESCE("title", 'Untitled event'),
    "category" = COALESCE("category", 'program')
WHERE "title" IS NULL OR "category" IS NULL;

-- ── 4. Backfill stage ────────────────────────────────────────────────────────
-- Every legacy row had calendar commitment, so the floor is Confirmed; rated or
-- past events are Done. None land in Idea (they all kept a CalendarEvent).
UPDATE "ProgrammingEvent"
SET "stage" = CASE
  WHEN "successRating" IS NOT NULL THEN 'done'
  WHEN "date" IS NOT NULL AND "date" < to_char(CURRENT_DATE, 'YYYY-MM-DD') THEN 'done'
  ELSE 'confirmed'
END;

-- ── 5. Tighten constraints now that data is populated ────────────────────────
ALTER TABLE "ProgrammingEvent" ALTER COLUMN "title"    SET NOT NULL;
ALTER TABLE "ProgrammingEvent" ALTER COLUMN "category" SET NOT NULL;

ALTER TABLE "ProgrammingEvent" ADD CONSTRAINT "ProgrammingEvent_stage_check"
  CHECK ("stage" IN ('idea', 'planning', 'confirmed', 'done'));
-- Planning+ stages must have a backing CalendarEvent and a date.
ALTER TABLE "ProgrammingEvent" ADD CONSTRAINT "ProgrammingEvent_stage_calendar_check"
  CHECK ("stage" = 'idea' OR "calendarEventId" IS NOT NULL);
ALTER TABLE "ProgrammingEvent" ADD CONSTRAINT "ProgrammingEvent_stage_date_check"
  CHECK ("stage" = 'idea' OR "date" IS NOT NULL);

-- ── 6. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX "ProgrammingEvent_organizationId_stage_idx" ON "ProgrammingEvent"("organizationId", "stage");
CREATE INDEX "ProgrammingEvent_organizationId_date_idx"  ON "ProgrammingEvent"("organizationId", "date");
