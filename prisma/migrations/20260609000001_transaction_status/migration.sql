-- Add Transaction.status — distinguishes posted (actual) from scheduled (planned) transactions.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- Treasurers need to log future costs (deposits, supply orders) before money
-- leaves the account. Without a status field, a future-dated expense looks
-- identical to a past one and immediately collapses the displayed balance, which
-- is misleading. This column lets the UI show a separate "actual" vs "scheduled"
-- balance split and renders scheduled rows with an amber visual indicator.
--
-- Values:
--   "posted"    — default; the transaction has occurred (past or present date)
--   "scheduled" — the transaction is planned but not yet paid
--
-- No data backfill needed — DEFAULT 'posted' covers all existing rows.
-- No new sequence, so no extra GRANT required for the figurints_app role.
--
-- Idempotent (IF NOT EXISTS) to match this repo's migration convention.
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'posted';

ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "transaction_status_check";
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_status_check"
  CHECK (status IN ('posted', 'scheduled'));
