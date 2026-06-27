-- Drop Poll.title.
--
-- Polls no longer carry a separate title: the question IS the heading, shown
-- everywhere a title used to be (list row + card). Backfill any rows that had a
-- title but somehow an empty question first (defensive — the form always sent a
-- question), then drop the column. Idempotent.

-- Defensive backfill: never leave a poll with no question text.
UPDATE "Poll" SET "question" = "title"
  WHERE ("question" IS NULL OR "question" = '') AND "title" IS NOT NULL AND "title" <> '';

ALTER TABLE "Poll" DROP COLUMN IF EXISTS "title";
