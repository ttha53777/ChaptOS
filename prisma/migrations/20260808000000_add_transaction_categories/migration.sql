-- TransactionCategory: the org's own income and expense vocabulary.
--
-- Until now the platform hardcoded one fraternity's words for everyone —
-- INCOME_CATEGORIES / EXPENSE_CATEGORIES in app/data.ts ("Door", "Party
-- Supplies", "Brotherhood"). A sorority has no Party Supplies; a club team has
-- league fees and uniforms. This table gives each org an editable copy.
--
-- THE LOAD-BEARING CHOICE: `slug` holds the string ALREADY STORED in
-- Transaction.category / Reimbursement.category / BudgetAllocation.category,
-- verbatim, and is immutable. A legacy slug is literally 'Party Supplies' —
-- space and capitals and all. So this migration rewrites ZERO financial rows,
-- and DUES_CATEGORY ('Dues', lib/dues.ts) stays valid unchanged as a reserved
-- slug. `label` is the renameable display name, which makes renaming a category
-- a one-row UPDATE instead of a data migration over live money.
--
-- `kind` is in the unique key so an org can run 'Merch' as both an income and an
-- expense stream. There is deliberately no FK from Transaction.category —
-- integrity is enforced in the service layer (assertCategoryExists), matching
-- CalendarEventType (20260718000000).
--
-- Also adds OrganizationConfig.openingBalance: what was in the account when the
-- org started keeping books here. Every balance is measured from it
-- (lib/treasury-balance.ts); without it an org that joins mid-year with $4,200
-- in the bank reads $0 until it back-fills its whole history.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING throughout). Carries the
-- standard org-scoped-table boilerplate: app-role CRUD + sequence grants (see
-- 20260611000004_programming_app_grants for the cautionary tale of omitting the
-- sequence grant) and, since Phase 4 RLS is enforcing, a direct `org_isolation`
-- policy rather than the historical permissive allow_all.

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TransactionCategory" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "kind"           TEXT NOT NULL,
  "slug"           TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "color"          TEXT NOT NULL,
  "colorDark"      TEXT,
  "builtin"        BOOLEAN NOT NULL DEFAULT false,
  "hidden"         BOOLEAN NOT NULL DEFAULT false,
  "displayOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Foreign key ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransactionCategory_organizationId_fkey') THEN
    ALTER TABLE "TransactionCategory"
      ADD CONSTRAINT "TransactionCategory_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionCategory_organizationId_kind_slug_key"
  ON "TransactionCategory" ("organizationId", "kind", "slug");
CREATE INDEX IF NOT EXISTS "TransactionCategory_organizationId_idx"
  ON "TransactionCategory" ("organizationId");

-- ── Kind CHECK (mirrors lib/state/transaction-type.ts, like Transaction_type_check) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_category_kind_check') THEN
    ALTER TABLE "TransactionCategory"
      ADD CONSTRAINT "transaction_category_kind_check"
      CHECK ("kind" IN ('income', 'expense'));
  END IF;
END $$;

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "TransactionCategory" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "TransactionCategory_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + enforcing org_isolation (Phase 4 — no allow_all) ───────────
ALTER TABLE "TransactionCategory" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON "TransactionCategory";
CREATE POLICY org_isolation ON "TransactionCategory"
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

-- ── OrganizationConfig.openingBalance ─────────────────────────────────────────
ALTER TABLE "OrganizationConfig"
  ADD COLUMN IF NOT EXISTS "openingBalance"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "openingBalanceCents" BIGINT;


-- ═══════════════════════════════════════════════════════════════════════════════
-- BACKFILL — three passes. Order matters: pass 1 claims the good labels and
-- colors, pass 2 only fills gaps that pass 1 didn't cover.
-- createdAt/updatedAt are listed explicitly because @updatedAt is a Prisma-client
-- default, not a DB one, and a raw INSERT would leave it null.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Pass 1: the 14 constants every org uses today ─────────────────────────────
-- This is what guarantees existing orgs keep exactly the vocabulary they have.
-- Colors mirror INCOME_PALETTE / EXPENSE_PALETTE in lib/transaction-categories.ts
-- (cool-leaning for money in, warm-leaning for money out), both drawn from
-- EVENT_TYPE_PALETTE so a seeded color is always one an officer could re-pick.
--
-- `builtin` is true for exactly the two RESERVED slugs (lib/transaction-categories.ts),
-- NOT for all 14. builtin means "the server writes or matches on this itself, so it
-- can't be deleted or hidden" — income/'Dues' carries the whole dues↔ledger invariant,
-- and expense/'Reimbursement' is the fallback an approved reimbursement lands in. The
-- other 13 are ordinary editable rows: an org that never throws a party must be able
-- to delete "Party Supplies", which is the entire point of this change.
INSERT INTO "TransactionCategory"
  ("organizationId", "kind", "slug", "label", "color", "colorDark",
   "builtin", "hidden", "displayOrder", "createdAt", "updatedAt")
SELECT o."id", v.kind, v.slug, v.slug, v.color, v.color_dark,
       v.builtin, false, v.display_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
  ('income',  'Dues',             '#4a7d4c', '#86b988', true,  0),
  ('income',  'Door',             '#2f8579', '#5fbdb0', false, 1),
  ('income',  'Fundraiser',       '#2f5d7c', '#7fb3d9', false, 2),
  ('income',  'Event',            '#3f6ea3', '#8fb0d6', false, 3),
  ('income',  'Alumni donation',  '#6d28d9', '#a78bfa', false, 4),
  ('income',  'Fines',            '#8b3fa3', '#c98bd9', false, 5),
  ('income',  'External / misc',  '#9a7224', '#ddb36a', false, 6),
  ('expense', 'Party Supplies',   '#c14a37', '#e0796b', false, 0),
  ('expense', 'Operations',       '#9a7224', '#ddb36a', false, 1),
  ('expense', 'Brotherhood',      '#b34f72', '#d98ba3', false, 2),
  ('expense', 'Events',           '#8b3fa3', '#c98bd9', false, 3),
  ('expense', 'House',            '#6d28d9', '#a78bfa', false, 4),
  ('expense', 'Travel',           '#3f6ea3', '#8fb0d6', false, 5),
  ('expense', 'Misc',             '#2f8579', '#5fbdb0', false, 6),
  -- Not one of the 14, but reimbursement-service.ts mints expense rows under it
  -- whenever an approved reimbursement carries no category. It has always been
  -- off-list; make it a real row rather than an instantly-invalid one.
  ('expense', 'Reimbursement',    '#2f5d7c', '#7fb3d9', true,  7)
) AS v(kind, slug, color, color_dark, builtin, display_order)
ON CONFLICT ("organizationId", "kind", "slug") DO NOTHING;

-- ── Pass 2: every category any org ACTUALLY has data under ────────────────────
-- Without this, an org that typed a category through the API (which never
-- validated) or carries pre-migration values would have live rows pointing at a
-- category that doesn't exist, and its next edit would be rejected. Anything
-- pass 1 already inserted is skipped by the ON CONFLICT.
WITH used AS (
  SELECT DISTINCT "organizationId", "type" AS kind, "category" AS slug
  FROM "Transaction"
  WHERE "deletedAt" IS NULL AND "category" <> ''
  UNION
  SELECT DISTINCT "organizationId", 'expense', "category"
  FROM "Reimbursement"
  WHERE "category" IS NOT NULL AND "category" <> ''
  UNION
  SELECT DISTINCT b."organizationId", 'expense', a."category"
  FROM "BudgetAllocation" a
  JOIN "Budget" b ON b."id" = a."budgetId"
  WHERE a."category" <> ''
),
ranked AS (
  SELECT "organizationId", kind, slug,
         ROW_NUMBER() OVER (PARTITION BY "organizationId", kind ORDER BY slug) AS rn
  FROM used
)
INSERT INTO "TransactionCategory"
  ("organizationId", "kind", "slug", "label", "color", "colorDark",
   "builtin", "hidden", "displayOrder", "createdAt", "updatedAt")
SELECT r."organizationId", r.kind, r.slug, r.slug,
       (ARRAY['#3f6ea3','#b34f72','#c14a37','#2f8579','#9a7224','#4a7d4c','#6d28d9','#2f5d7c','#8b3fa3'])[(r.rn % 9) + 1],
       (ARRAY['#8fb0d6','#d98ba3','#e0796b','#5fbdb0','#ddb36a','#86b988','#a78bfa','#7fb3d9','#c98bd9'])[(r.rn % 9) + 1],
       false, false, 100 + r.rn::integer, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM ranked r
ON CONFLICT ("organizationId", "kind", "slug") DO NOTHING;

-- ── Pass 3: legacy orgs are "configured" with a zero offset ───────────────────
-- Every balance on the platform was previously computed from transactions alone,
-- i.e. from an implicit opening balance of 0. Writing that 0 explicitly means no
-- displayed number moves for any existing org, and leaves null to mean what it
-- should from here on: an org created AFTER this migration that hasn't been asked.
UPDATE "OrganizationConfig"
SET "openingBalance" = 0, "openingBalanceCents" = 0
WHERE "openingBalance" IS NULL;
