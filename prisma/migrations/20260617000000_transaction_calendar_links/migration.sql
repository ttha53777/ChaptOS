-- Link Transactions to CalendarEvents via a TransactionCalendarEvent join table,
-- and drop the retired free-text Transaction.paidTo column.
--
-- ── Why this migration exists ────────────────────────────────────────────────
-- The treasury-dusk reskin introduced a many-to-many between Transaction and
-- CalendarEvent (a transaction can be tagged to one or more events) and removed
-- the free-text "paidTo" field. The schema + generated client were updated and
-- the dev DB was brought up with `prisma db push`, but NO migration was ever
-- recorded. Two consequences:
--   1. Fresh DBs (CI / new envs) had no "TransactionCalendarEvent" table at all.
--   2. The pushed dev DB got the table WITHOUT the app-role GRANTs + RLS that
--      every other org-scoped table carries. figurints_app (the non-BYPASSRLS
--      role the app connects as through the pooler) therefore had NO privileges
--      on it, so every GET /api/transactions 500'd with "permission denied for
--      table TransactionCalendarEvent" — the list query include's the join.
--
-- This migration is fully idempotent: on the already-pushed dev DB only the
-- missing GRANTs + RLS take effect; on a fresh DB it builds everything. Tenant
-- isolation stays at the app layer (lib/db/tenant.ts appends organizationId);
-- the allow_all RLS policy is defense-in-depth, matching the convention in
-- 20260611000004_programming_app_grants.

-- ── Join table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TransactionCalendarEvent" (
  "transactionId"   INTEGER NOT NULL,
  "calendarEventId" INTEGER NOT NULL,
  CONSTRAINT "TransactionCalendarEvent_pkey" PRIMARY KEY ("transactionId", "calendarEventId")
);

CREATE INDEX IF NOT EXISTS "TransactionCalendarEvent_calendarEventId_idx"
  ON "TransactionCalendarEvent" ("calendarEventId");

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS; guard each FK on pg_constraint.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TransactionCalendarEvent_transactionId_fkey'
      AND conrelid = '"TransactionCalendarEvent"'::regclass
  ) THEN
    ALTER TABLE "TransactionCalendarEvent"
      ADD CONSTRAINT "TransactionCalendarEvent_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TransactionCalendarEvent_calendarEventId_fkey'
      AND conrelid = '"TransactionCalendarEvent"'::regclass
  ) THEN
    ALTER TABLE "TransactionCalendarEvent"
      ADD CONSTRAINT "TransactionCalendarEvent_calendarEventId_fkey"
      FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id")
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- ── Drop the retired free-text payee column ──────────────────────────────────
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "paidTo";

-- ── App-role GRANTs (composite PK → no sequence to grant) ─────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "TransactionCalendarEvent" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all (defense-in-depth) ───────────────────
ALTER TABLE "TransactionCalendarEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "TransactionCalendarEvent";
CREATE POLICY allow_all ON "TransactionCalendarEvent" USING (true) WITH CHECK (true);
