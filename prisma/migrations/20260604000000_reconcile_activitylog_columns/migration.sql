-- Reconcile ActivityLog.organizationId + actorId into migration history.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The live database has ActivityLog.organizationId (NOT NULL, FK → Organization)
-- and ActivityLog.actorId (nullable, FK → Brother ON DELETE SET NULL), plus their
-- indexes — and prisma/schema.prisma declares all of them. But NO migration ever
-- added them: the original 20260513101933_add_activity_log creates the table with
-- only id/message/timestamp/type, and the columns were introduced out-of-band via
-- `prisma db push`. So a database rebuilt purely from migrations would be missing
-- them, drifting from the schema.
--
-- This migration adds exactly the live shape so `migrate` history reproduces the
-- real table. It is fully idempotent (IF NOT EXISTS / guarded DO blocks): against
-- the live DB — where everything already exists — every statement is a no-op, so
-- applying it changes nothing. On a fresh build it creates the columns, FKs, and
-- indexes.
--
-- Column nullability note: organizationId is NOT NULL in the live shape. On a
-- fresh build ActivityLog is empty when this runs, so adding it NOT NULL is safe
-- (no rows to backfill). We add it nullable then SET NOT NULL only when the
-- column was freshly created, mirroring how the other tenancy columns were
-- introduced, so the statement never fails on an empty table.

-- ── organizationId ──────────────────────────────────────────────────────────
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;

DO $$ BEGIN
  -- Enforce NOT NULL to match the live shape. Safe: on a fresh build the table is
  -- empty; on the live DB the column is already NOT NULL so this is a no-op.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ActivityLog' AND column_name = 'organizationId' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "ActivityLog" ALTER COLUMN "organizationId" SET NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActivityLog_organizationId_fkey') THEN
    ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ActivityLog_organizationId_idx"
  ON "ActivityLog" ("organizationId", "timestamp");

-- ── actorId ─────────────────────────────────────────────────────────────────
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "actorId" INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActivityLog_actorId_fkey') THEN
    ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "Brother"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ActivityLog_actorId_idx"
  ON "ActivityLog" ("actorId");
