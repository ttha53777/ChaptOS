-- Give an InstagramTask its own actual posting date, distinct from dueDate.
--
-- ── Why this migration exists ────────────────────────────────────────────────
-- dueDate is the planned/target date and drives urgency (overdue, this week).
-- It was doubling as the "posted on" date once a post went live, so there was
-- no way to record that a post scheduled for the 10th actually went out on the
-- 12th. This adds a nullable postedDate: null while open, set when marked posted
-- (defaulting to dueDate) and independently editable in the post's Edit form.
--
-- Nullable, no default — existing open posts stay null. We intentionally do NOT
-- backfill already-"posted" rows here; the app reads postedDate ?? dueDate, so
-- historical posts keep showing their dueDate as the posted-on date until edited.
--
-- Idempotent: safe on a dev DB already brought up via `prisma db push`. Adding a
-- nullable column doesn't change table privileges, so no GRANT/RLS block needed.

ALTER TABLE "InstagramTask" ADD COLUMN IF NOT EXISTS "postedDate" TEXT;
