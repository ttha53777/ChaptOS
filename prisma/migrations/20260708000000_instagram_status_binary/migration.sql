-- Collapse InstagramTask.status to a binary open | posted value.
--
-- ── Why this migration exists ────────────────────────────────────────────────
-- The Instagram page stored a 4-value status (Upcoming / Due Soon / Urgent /
-- Complete) that mixed *urgency* into the persisted status. In practice the page
-- only ever cared whether a post was Complete — every lane, count, and pill is
-- derived from dueDate plus that one flag. This mirrors the earlier Task
-- migration (20260619000000_add_tasks_supersede_deadlines), which unified
-- status to open | done with urgency computed from dueDate, never stored.
--
-- Mapping: legacy 'Complete' → 'posted', everything else → 'open'.
--
-- Idempotent: safe on a dev DB already brought up via `prisma db push`.
-- InstagramTask already carries its app-role GRANTs + RLS policy from its
-- original migration; changing values / default / adding a CHECK doesn't change
-- table privileges, so no GRANT/RLS block is needed here.

-- Backfill existing rows to the new vocabulary before constraining the column.
UPDATE "InstagramTask"
  SET "status" = CASE WHEN "status" = 'Complete' THEN 'posted' ELSE 'open' END;

ALTER TABLE "InstagramTask" ALTER COLUMN "status" SET DEFAULT 'open';

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS; guard the CHECK on pg_constraint.
-- InstagramTask.status: open | posted (urgency is computed from dueDate).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InstagramTask_status_check'
      AND conrelid = '"InstagramTask"'::regclass
  ) THEN
    ALTER TABLE "InstagramTask"
      ADD CONSTRAINT "InstagramTask_status_check"
      CHECK ("status" IN ('open','posted'));
  END IF;
END $$;
