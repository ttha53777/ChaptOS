-- Manual drag-order for docs (within a section) and folders (among unpinned).
--
-- position is a nullable Int. NULL = never hand-ordered; such rows sort after
-- positioned ones by their existing tiebreak (newest for docs, name for
-- folders). A drag-reorder rewrites the positions of the rows in that one
-- section to a dense 0..n-1 sequence. Docs only honor position under the
-- "manual" library sort; folders float pinned-first, then by position, then by
-- name.
--
-- No new table/sequence, so no app-role GRANT or RLS boilerplate — both Doc and
-- DocFolder already carry those. UPDATE is already granted, so setting position
-- needs nothing further. Idempotent throughout; NULL default means existing
-- rows need no backfill.

ALTER TABLE "Doc"       ADD COLUMN IF NOT EXISTS "position" INTEGER;
ALTER TABLE "DocFolder" ADD COLUMN IF NOT EXISTS "position" INTEGER;

-- The manual-sort doc query orders within a folder by position; index the
-- positioned rows per (org, folder). Folder reorder is a small per-org set, so
-- no dedicated index there.
CREATE INDEX IF NOT EXISTS "Doc_organizationId_folderId_position_idx"
  ON "Doc" ("organizationId", "folderId", "position")
  WHERE "position" IS NOT NULL;
