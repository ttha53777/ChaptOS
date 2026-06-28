-- Doc folders.
--
-- A flat (one-level) folder for grouping Docs on the /docs page, à la Google
-- Drive. Docs reference a folder via the new Doc.folderId column; folderId NULL
-- means the doc sits at the library root. Deleting a folder releases its docs
-- back to root (the service nulls Doc.folderId) rather than cascading — so the
-- Doc → DocFolder FK is ON DELETE SET NULL as a belt-and-suspenders backstop.
--
-- Idempotent throughout. Carries the standard org-scoped-table boilerplate for
-- the new DocFolder table: app-role CRUD + sequence grants + permissive
-- allow_all RLS. Omitting the sequence grant makes INSERT fail "permission
-- denied for sequence" (see 20260611000004_programming_app_grants).
--
-- The Doc.folderId column needs no new RLS — Doc already carries its allow_all
-- policy from its original migration.

-- ── DocFolder table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DocFolder" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "name"           TEXT NOT NULL,
  "createdById"    INTEGER,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Doc.folderId column ─────────────────────────────────────────────────────
ALTER TABLE "Doc" ADD COLUMN IF NOT EXISTS "folderId" INTEGER;

-- ── Foreign keys ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DocFolder_organizationId_fkey') THEN
    ALTER TABLE "DocFolder"
      ADD CONSTRAINT "DocFolder_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Doc_folderId_fkey') THEN
    ALTER TABLE "Doc"
      ADD CONSTRAINT "Doc_folderId_fkey"
      FOREIGN KEY ("folderId") REFERENCES "DocFolder"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "DocFolder_organizationId_name_idx"
  ON "DocFolder" ("organizationId", "name");
CREATE INDEX IF NOT EXISTS "Doc_organizationId_folderId_idx"
  ON "Doc" ("organizationId", "folderId");

-- ── App-role GRANTs ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "DocFolder" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "DocFolder_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all ─────────────────────────────────────
ALTER TABLE "DocFolder" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "DocFolder";
CREATE POLICY allow_all ON "DocFolder" USING (true) WITH CHECK (true);
