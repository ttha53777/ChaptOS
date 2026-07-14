-- Link an approved Reimbursement to the ledger row it mints.
--
-- ── Why this migration exists ────────────────────────────────────────────────
-- Reimbursement and Transaction were two books that never met. 20260618000000
-- created Reimbursement and said approved ones "may optionally be linked to a
-- Transaction in the future, but for now they stand alone" — and approval was
-- built as a status flip and nothing more. Every balance in the app is derived by
-- summing Transaction rows, so an approved payout moved no number anywhere: not
-- the treasury balance, not the budget page, not the AI's treasury tools. The
-- money left the chapter's account and the app never noticed.
--
-- Approval is the moment a request becomes money movement, so it must mint an
-- expense row. `transactionId` is what makes that safe rather than merely done:
-- it answers "has this already been posted?" (idempotency — a double-approve
-- can't double-book) and "which row do I reverse?" (un-approve soft-deletes it).
--
-- `category` lets the requester name the budget bucket the spend belongs to.
-- Without it the ledger row can only be filed under a generic "Reimbursement"
-- category that no budget allocation is named, so the Budget page's per-allocation
-- "spent" figure would stay at zero even after the money is booked — half a fix.
--
-- Both columns are nullable with no backfill. Reimbursements approved before this
-- migration have no ledger row and cannot retroactively grow one (we don't know
-- what was actually paid out); they stay linkless and are reconciled by hand.
--
-- Also adds the status CHECK the original table migration never got. Every other
-- status column in the schema has one (see 20260529000000_phase25_state_checks);
-- Reimbursement.status was enforced only in Zod/TS via lib/state.
--
-- Idempotent throughout. Adding nullable columns doesn't change table privileges,
-- so no GRANT/sequence/RLS block is needed (contrast the new-table boilerplate in
-- 20260618000000).
--
-- Reversible:
--   ALTER TABLE "Reimbursement" DROP CONSTRAINT "reimbursement_status_check";
--   ALTER TABLE "Reimbursement" DROP CONSTRAINT "Reimbursement_transactionId_fkey";
--   DROP INDEX "Reimbursement_transactionId_key";
--   ALTER TABLE "Reimbursement" DROP COLUMN "transactionId", DROP COLUMN "category";

-- ── Columns ───────────────────────────────────────────────────────────────────
ALTER TABLE "Reimbursement" ADD COLUMN IF NOT EXISTS "category"      TEXT;
ALTER TABLE "Reimbursement" ADD COLUMN IF NOT EXISTS "transactionId" INTEGER;

-- ── Unique link ───────────────────────────────────────────────────────────────
-- One reimbursement, at most one ledger row — and no two reimbursements may claim
-- the same Transaction. This is the last line of defence behind the service's
-- compare-and-set if two approvals ever race.
CREATE UNIQUE INDEX IF NOT EXISTS "Reimbursement_transactionId_key"
  ON "Reimbursement" ("transactionId");

-- ── Foreign key ───────────────────────────────────────────────────────────────
-- SET NULL, not CASCADE: hard-deleting a Transaction must not delete the request
-- that produced it. The request survives, unlinked, and is visibly unreconciled.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reimbursement_transactionId_fkey') THEN
    ALTER TABLE "Reimbursement"
      ADD CONSTRAINT "Reimbursement_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ── Status CHECK (mirrors lib/state/reimbursement-status.ts) ──────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reimbursement_status_check') THEN
    ALTER TABLE "Reimbursement"
      ADD CONSTRAINT "reimbursement_status_check"
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;
