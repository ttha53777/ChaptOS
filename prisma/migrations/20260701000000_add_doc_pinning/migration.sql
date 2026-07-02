-- Pinned / favorite docs and folders.
--
-- A pinned Doc or DocFolder floats to the top of the /docs library ahead of the
-- user's chosen sort. We store the pin as a nullable timestamp rather than a
-- boolean: pinnedAt NULL = not pinned; a non-NULL value both marks the pin and
-- gives a stable, meaningful order among pins (most-recently pinned first).
--
-- Idempotent throughout. No new tables, GRANTs, or RLS: both Doc and DocFolder
-- already carry their app-role CRUD + allow_all policies, and UPDATE is already
-- granted, so setting pinnedAt needs nothing further.

ALTER TABLE "Doc"       ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);
ALTER TABLE "DocFolder" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);

-- Partial indexes: the library query filters/sorts on pinned rows, and the vast
-- majority of rows are unpinned, so index only the pinned ones per org.
CREATE INDEX IF NOT EXISTS "Doc_organizationId_pinnedAt_idx"
  ON "Doc" ("organizationId", "pinnedAt")
  WHERE "pinnedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "DocFolder_organizationId_pinnedAt_idx"
  ON "DocFolder" ("organizationId", "pinnedAt")
  WHERE "pinnedAt" IS NOT NULL;
