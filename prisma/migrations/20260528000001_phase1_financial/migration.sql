-- Phase 1: Add amountCents + semesterId FK to Transaction and Budget.
-- Idempotent: uses IF NOT EXISTS throughout.

-- ============================================================
-- 1. Add new columns (nullable for backfill safety)
-- ============================================================

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "amountCents" BIGINT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "semesterId"  INTEGER;

ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "semesterId"             INTEGER;
ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "carryoverBalanceCents"  BIGINT;
ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "reserveAmountCents"     BIGINT;

-- ============================================================
-- 2. Backfill amountCents from amount (× 100, rounded)
-- ============================================================

UPDATE "Transaction"
SET "amountCents" = ROUND("amount" * 100)::BIGINT
WHERE "amountCents" IS NULL;

-- ============================================================
-- 3. Backfill semesterId by matching Semester.label within org
-- ============================================================

UPDATE "Transaction" t
SET "semesterId" = s.id
FROM "Semester" s
WHERE s."organizationId" = t."organizationId"
  AND s."label"          = t."semester"
  AND t."semesterId"     IS NULL;

UPDATE "Budget" b
SET "semesterId"             = s.id,
    "carryoverBalanceCents"  = ROUND(b."carryoverBalance" * 100)::BIGINT,
    "reserveAmountCents"     = ROUND(b."reserveAmount"    * 100)::BIGINT
FROM "Semester" s
WHERE s."organizationId"     = b."organizationId"
  AND s."label"              = b."semester"
  AND b."semesterId"         IS NULL;

-- ============================================================
-- 4. Promote amountCents to NOT NULL (semesterId stays nullable)
-- ============================================================

ALTER TABLE "Transaction" ALTER COLUMN "amountCents" SET NOT NULL;

-- Budget cents fields: only set NOT NULL where rows exist and were backfilled
-- (all rows should be, but guard against an empty table)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Budget" WHERE "carryoverBalanceCents" IS NULL) THEN
    UPDATE "Budget" SET
      "carryoverBalanceCents" = ROUND("carryoverBalance" * 100)::BIGINT,
      "reserveAmountCents"    = ROUND("reserveAmount"    * 100)::BIGINT
    WHERE "carryoverBalanceCents" IS NULL;
  END IF;
END $$;

-- ============================================================
-- 5. Add FK constraints (idempotent)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_semesterId_fkey') THEN
    ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_semesterId_fkey"
      FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Budget_semesterId_fkey') THEN
    ALTER TABLE "Budget" ADD CONSTRAINT "Budget_semesterId_fkey"
      FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 6. New indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS "Transaction_semesterId_idx" ON "Transaction"("semesterId");
CREATE INDEX IF NOT EXISTS "Budget_semesterId_idx"      ON "Budget"("semesterId");
