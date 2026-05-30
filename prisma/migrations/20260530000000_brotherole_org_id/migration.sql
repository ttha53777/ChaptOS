-- Add organizationId to BrotherRole.
-- Denormalizing orgId here makes cross-org role assignment impossible at the DB
-- level: the FK ensures the org on the assignment matches the org on the role.
--
-- Idempotent: column/constraint additions use IF NOT EXISTS / IF EXISTS guards.

-- 1. Add column nullable so existing rows are not blocked.
ALTER TABLE "BrotherRole" ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;

-- 2. Backfill: every assignment's org derives unambiguously from its role.
UPDATE "BrotherRole" br
SET "organizationId" = r."organizationId"
FROM "Role" r
WHERE br."roleId" = r.id
  AND br."organizationId" IS NULL;

-- 3. Enforce NOT NULL now that every row has a value.
ALTER TABLE "BrotherRole" ALTER COLUMN "organizationId" SET NOT NULL;

-- 4. FK to Organization (matches Prisma's generated constraint name).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'BrotherRole_organizationId_fkey'
  ) THEN
    ALTER TABLE "BrotherRole"
      ADD CONSTRAINT "BrotherRole_organizationId_fkey"
      FOREIGN KEY ("organizationId")
      REFERENCES "Organization"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Index for org-scoped scans.
CREATE INDEX IF NOT EXISTS "BrotherRole_organizationId_idx" ON "BrotherRole"("organizationId");
