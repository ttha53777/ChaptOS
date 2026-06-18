-- Reimbursement: a member-submitted request for expense reimbursement that an
-- officer can approve or reject. Distinct from Transaction — a Reimbursement is
-- a ticket in a workflow; approved ones may optionally be linked to a Transaction
-- in the future, but for now they stand alone.
--
-- Idempotent (IF NOT EXISTS throughout). Carries the standard org-scoped-table
-- boilerplate: app-role CRUD + sequence grants + permissive allow_all RLS.
-- See 20260611000004_programming_app_grants for the cautionary tale of omitting
-- the sequence grant (INSERT fails "permission denied for sequence").

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Reimbursement" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "brotherId"      INTEGER NOT NULL,
  "amount"         DOUBLE PRECISION NOT NULL,
  "amountCents"    BIGINT,
  "date"           TEXT NOT NULL,
  "description"    TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "rejectionNote"  TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reimbursement_organizationId_fkey') THEN
    ALTER TABLE "Reimbursement"
      ADD CONSTRAINT "Reimbursement_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reimbursement_brotherId_fkey') THEN
    ALTER TABLE "Reimbursement"
      ADD CONSTRAINT "Reimbursement_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Reimbursement_organizationId_idx"
  ON "Reimbursement" ("organizationId");
CREATE INDEX IF NOT EXISTS "Reimbursement_brotherId_idx"
  ON "Reimbursement" ("brotherId");
CREATE INDEX IF NOT EXISTS "Reimbursement_organizationId_status_idx"
  ON "Reimbursement" ("organizationId", "status");

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Reimbursement" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "Reimbursement_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all ───────────────────────────────────────
ALTER TABLE "Reimbursement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "Reimbursement";
CREATE POLICY allow_all ON "Reimbursement" USING (true) WITH CHECK (true);
