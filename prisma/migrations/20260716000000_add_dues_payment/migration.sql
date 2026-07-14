-- DuesPayment: a submitted dues payment awaiting treasury approval. Distinct from
-- Transaction — a DuesPayment is a ticket in a workflow; approving it is the one
-- moment that mints the ledger row and decrements Brother.duesOwed, atomically
-- (see updateDuesPayment in lib/services/dues-service.ts). Nothing moves on either
-- book at submission time.
--
-- Same shape as Reimbursement (20260618000000_add_reimbursement) plus its later
-- ledger link (20260713000000_reimbursement_ledger_link), collapsed into one
-- migration since this table starts life already knowing about the link.
--
-- Idempotent (IF NOT EXISTS throughout). Carries the standard org-scoped-table
-- boilerplate: app-role CRUD + sequence grants + permissive allow_all RLS. See
-- 20260611000004_programming_app_grants for the cautionary tale of omitting the
-- sequence grant (INSERT fails "permission denied for sequence").

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DuesPayment" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "brotherId"      INTEGER NOT NULL,
  "amount"         DOUBLE PRECISION NOT NULL,
  "amountCents"    BIGINT,
  "date"           TEXT NOT NULL,
  "paymentMethod"  TEXT,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "rejectionNote"  TEXT,
  "transactionId"  INTEGER,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DuesPayment_organizationId_fkey') THEN
    ALTER TABLE "DuesPayment"
      ADD CONSTRAINT "DuesPayment_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DuesPayment_brotherId_fkey') THEN
    ALTER TABLE "DuesPayment"
      ADD CONSTRAINT "DuesPayment_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE;
  END IF;
  -- SET NULL, not CASCADE: hard-deleting a Transaction must not delete the request
  -- that produced it. The request survives, unlinked, and is visibly unreconciled —
  -- same reasoning as Reimbursement_transactionId_fkey.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DuesPayment_transactionId_fkey') THEN
    ALTER TABLE "DuesPayment"
      ADD CONSTRAINT "DuesPayment_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ── Unique link ───────────────────────────────────────────────────────────────
-- One request, at most one ledger row — and no two requests may claim the same
-- Transaction. Last line of defence behind the service's compare-and-set.
CREATE UNIQUE INDEX IF NOT EXISTS "DuesPayment_transactionId_key"
  ON "DuesPayment" ("transactionId");

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "DuesPayment_organizationId_idx"
  ON "DuesPayment" ("organizationId");
CREATE INDEX IF NOT EXISTS "DuesPayment_brotherId_idx"
  ON "DuesPayment" ("brotherId");
CREATE INDEX IF NOT EXISTS "DuesPayment_organizationId_status_idx"
  ON "DuesPayment" ("organizationId", "status");

-- ── Status CHECK (mirrors lib/state/dues-payment-status.ts) ───────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dues_payment_status_check') THEN
    ALTER TABLE "DuesPayment"
      ADD CONSTRAINT "dues_payment_status_check"
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "DuesPayment" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "DuesPayment_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all ───────────────────────────────────────
ALTER TABLE "DuesPayment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "DuesPayment";
CREATE POLICY allow_all ON "DuesPayment" USING (true) WITH CHECK (true);
