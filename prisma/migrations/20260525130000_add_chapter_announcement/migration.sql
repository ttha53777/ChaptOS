-- ChapterAnnouncement: a single pinned announcement shown at the top of the
-- dashboard. Single-row by convention — the API always upserts id = 1.
-- Idempotent so partial application is safe to re-run.

CREATE TABLE IF NOT EXISTS "ChapterAnnouncement" (
  "id"         INTEGER PRIMARY KEY DEFAULT 1,
  "title"      TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "ctaLabel"   TEXT,
  "ctaUrl"     TEXT,
  "authorId"   INTEGER,
  "authorName" TEXT,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
