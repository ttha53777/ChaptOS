-- Optionally link an InstagramTask to the CalendarEvent it promotes.
--
-- ── Why this migration exists ────────────────────────────────────────────────
-- An Instagram post is very often *about* an upcoming event. This adds a single
-- optional reference (InstagramTask.calendarEventId) so the planner can tag a
-- post to one event. It is a soft reference, not a date constraint — the post
-- keeps its own dueDate. A post links to at most one event, so this is a plain
-- nullable FK column rather than a join table (contrast TransactionCalendarEvent).
--
-- ON DELETE SET NULL: deleting the event clears the link but leaves the post.
--
-- Idempotent: safe on a dev DB already brought up via `prisma db push`.
-- InstagramTask already carries its app-role GRANTs + RLS policy from its
-- original migration, and adding a nullable column doesn't change table
-- privileges, so no GRANT/RLS block is needed here.

ALTER TABLE "InstagramTask" ADD COLUMN IF NOT EXISTS "calendarEventId" INTEGER;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS; guard the FK on pg_constraint.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InstagramTask_calendarEventId_fkey'
      AND conrelid = '"InstagramTask"'::regclass
  ) THEN
    ALTER TABLE "InstagramTask"
      ADD CONSTRAINT "InstagramTask_calendarEventId_fkey"
      FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InstagramTask_calendarEventId_idx"
  ON "InstagramTask" ("calendarEventId");
