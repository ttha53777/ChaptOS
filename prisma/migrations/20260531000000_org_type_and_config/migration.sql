-- Multi-org Milestone 1: org-type column on Organization + sibling OrganizationConfig.
--
-- Adds:
--   * Organization.orgType            — registry key from lib/org-types.ts.
--   * Organization.createdByBrotherId — provenance of self-serve provisioning.
--   * OrganizationConfig              — per-org config (enabled workflows, vocab).
--
-- Backfill: existing rows (LPE, id=1) get orgType='fraternity' and a config row
-- with every workflow enabled, so nothing visible changes for LPE users.
--
-- Idempotent: all column/table additions use IF NOT EXISTS guards. Safe to
-- re-run on partial-apply DBs.

-- 1. Organization columns.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "orgType"            TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "createdByBrotherId" INTEGER;

-- 2. OrganizationConfig table.
CREATE TABLE IF NOT EXISTS "OrganizationConfig" (
  "id"                  SERIAL PRIMARY KEY,
  "organizationId"      INTEGER NOT NULL,
  "enabledWorkflows"    TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  "vocabularyOverrides" JSONB   NOT NULL DEFAULT '{}'::JSONB,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Unique constraint: one config per org.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationConfig_organizationId_key'
  ) THEN
    ALTER TABLE "OrganizationConfig"
      ADD CONSTRAINT "OrganizationConfig_organizationId_key" UNIQUE ("organizationId");
  END IF;
END $$;

-- 4. FK to Organization (cascade delete: removing an org takes its config).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationConfig_organizationId_fkey'
  ) THEN
    ALTER TABLE "OrganizationConfig"
      ADD CONSTRAINT "OrganizationConfig_organizationId_fkey"
      FOREIGN KEY ("organizationId")
      REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Index mirrors the unique constraint above; explicit @@index for symmetry.
CREATE INDEX IF NOT EXISTS "OrganizationConfig_organizationId_idx"
  ON "OrganizationConfig"("organizationId");

-- 6. Backfill orgType for every existing row that lacks one. LPE and any other
--    legacy orgs get 'fraternity'. New orgs supply this at create time.
UPDATE "Organization"
SET    "orgType" = 'fraternity'
WHERE  "orgType" IS NULL;

-- 7. Backfill OrganizationConfig: every existing org gets a config row with all
--    workflows enabled. Keeps current users' product surface unchanged.
INSERT INTO "OrganizationConfig" ("organizationId", "enabledWorkflows", "vocabularyOverrides", "updatedAt")
SELECT
  o.id,
  ARRAY[
    'members',
    'events',
    'attendance',
    'finance',
    'parties',
    'service',
    'communications',
    'docs',
    'operations'
  ]::TEXT[],
  '{}'::JSONB,
  CURRENT_TIMESTAMP
FROM   "Organization" o
WHERE  NOT EXISTS (
  SELECT 1 FROM "OrganizationConfig" c WHERE c."organizationId" = o.id
);
