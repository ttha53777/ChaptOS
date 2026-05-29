-- Phase 2.5: enforce one announcement per org.
--
-- The ChapterAnnouncement table previously used a global singleton (id=1) and
-- had only a plain index on organizationId. Now that each org owns its own row,
-- we add a unique constraint so upserts can key on organizationId alone.
--
-- Safe to apply: existing data has at most one row per org (the old singleton
-- pattern guaranteed this), so no rows will violate the constraint.

CREATE UNIQUE INDEX IF NOT EXISTS "ChapterAnnouncement_organizationId_key"
  ON "ChapterAnnouncement"("organizationId");
