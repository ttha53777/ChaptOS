-- Attribute a ledger row to the member it came from, so dues payments can be
-- reconciled against Brother.duesOwed.
--
-- ── Why this migration exists ────────────────────────────────────────────────
-- Brother.duesOwed and the Transaction ledger were two books that never met.
-- duesOwed was a hand-maintained Float that admins overwrote as a plain field
-- (and that the AI's "mark dues paid" proposal zeroed with { duesOwed: 0 });
-- dues income lived separately as Transaction rows with category = 'Dues'.
-- No code path decremented duesOwed when a dues Transaction was recorded, and
-- no code path wrote a Transaction when duesOwed was zeroed.
--
-- So the roster could say every member was square while the ledger said the
-- chapter had collected nothing, and both numbers were shown to users as fact.
-- Nothing surfaced the contradiction, because nothing *could*: a dues payment
-- was not attributable to a member at all. The description string was the only
-- hint about who paid. Without this column, "does the roster agree with the
-- ledger?" is a question the database physically cannot answer.
--
-- `brotherId` is what makes reconciliation possible rather than merely desired.
-- It also answers "how much has this member actually paid?" from the ledger —
-- which is what will later let duesOwed be derived outright (owed = charged −
-- payments) instead of stored, without a second migration of this size.
--
-- Nullable, with no backfill. Most spend belongs to no one member (a Costco run),
-- so the column is empty for the vast majority of rows by design. And historical
-- 'Dues' rows cannot honestly be attributed after the fact — we don't know who
-- paid them; the description was free text. They stay linkless and are surfaced
-- as "unattributed" in the reconciliation panel rather than guessed at.
--
-- Adding a nullable column doesn't change table privileges, so no GRANT/sequence
-- block is needed (contrast the new-table boilerplate in 20260618000000), and it
-- doesn't touch RLS: org_isolation already keys off organizationId.
--
-- Reversible:
--   ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_brotherId_fkey";
--   DROP INDEX "Transaction_organizationId_brotherId_idx";
--   ALTER TABLE "Transaction" DROP COLUMN "brotherId";

-- ── Column ────────────────────────────────────────────────────────────────────
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "brotherId" INTEGER;

-- ── Foreign key ───────────────────────────────────────────────────────────────
-- SET NULL, not CASCADE: removing a member from the roster must not delete the
-- chapter's record that they paid. The money really moved. The income row
-- survives, unlinked, and shows up as unattributed — which is true.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_brotherId_fkey') THEN
    ALTER TABLE "Transaction"
      ADD CONSTRAINT "Transaction_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ── Index ─────────────────────────────────────────────────────────────────────
-- Serves the reconciliation groupBy (sum of dues paid per member, per org) and
-- the per-member payment history on the roster drawer.
CREATE INDEX IF NOT EXISTS "Transaction_organizationId_brotherId_idx"
  ON "Transaction" ("organizationId", "brotherId");
