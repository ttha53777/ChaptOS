-- Platform billing: what an org pays US. Three tables plus one column.
--
-- Emphatically NOT related to Transaction / DuesPayment / Reimbursement, which
-- track money moving *inside* an org and never touch a payment processor. The
-- two vocabularies are kept apart deliberately — "subscription / plan / tier" is
-- platform revenue, "dues / transaction / treasury" is chapter bookkeeping.
--
-- Pricing is one volume-tiered Stripe Price (see lib/billing/tiers.ts):
--   1–4 free · 5–50 $25/mo · 51–120 $65/mo · 121+ custom quote.
-- A band change is therefore only a quantity update on the subscription item;
-- there is no plan-switching logic to migrate.
--
-- Idempotent (IF NOT EXISTS throughout). Carries the standard org-scoped-table
-- boilerplate: app-role CRUD + sequence grants (see
-- 20260611000004_programming_app_grants for the cautionary tale of omitting the
-- sequence grant) and, since Phase 4 RLS is enforcing, a direct `org_isolation`
-- policy rather than the historical permissive allow_all — matching the most
-- recent new table, 20260724000000_add_chat_approval.
--
-- StripeEvent is the exception: it is GLOBAL (no organizationId), so it takes a
-- permissive allow_all policy, exactly like PlatformAdmin. See its section for
-- why it cannot be org-scoped.

-- ═══════════════════════════════════════════════════════════════════════════════
-- Brother.archivedAt
-- ═══════════════════════════════════════════════════════════════════════════════
-- Archiving is not deletion: attendance records, dues payments and metric values
-- all survive, so historical reporting stays correct. An archived member drops
-- out of the default roster read and out of the billable headcount, which is the
-- reason this column exists — without it an org has no way to stop paying for
-- graduated seniors short of destroying their history.
--
-- ALTER-only on an existing table, so none of the new-table boilerplate applies:
-- Brother's app-role grants and RLS policies were issued long ago and a
-- table-level GRANT covers columns added later. Backfills to NULL (= active), so
-- every existing row keeps its current behaviour.
ALTER TABLE "Brother" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- Partial index: every billable-headcount query and the default roster read
-- filter on archivedAt IS NULL, and the archived set is expected to stay a small
-- minority of rows.
CREATE INDEX IF NOT EXISTS "Brother_organizationId_archivedAt_idx"
  ON "Brother" ("organizationId") WHERE "archivedAt" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Subscription
-- ═══════════════════════════════════════════════════════════════════════════════
-- One row per org, created lazily on first read (free orgs included). Stripe ids
-- stay NULL until the org completes Checkout — we never create a $0 Stripe
-- subscription for a customer who has not entered a card.

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id"                   SERIAL PRIMARY KEY,
  "organizationId"       INTEGER NOT NULL,
  "stripeCustomerId"     TEXT,
  "stripeSubscriptionId" TEXT,
  "stripeItemId"         TEXT,
  "stripePriceId"        TEXT,
  "status"               TEXT NOT NULL DEFAULT 'free',
  "tier"                 TEXT NOT NULL DEFAULT 'free',
  "billableMembers"      INTEGER NOT NULL DEFAULT 0,
  "syncedQuantity"       INTEGER,
  "seatSyncPendingAt"    TIMESTAMP(3),
  "currentPeriodEnd"     TIMESTAMP(3),
  "cancelAtPeriodEnd"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_organizationId_fkey') THEN
    ALTER TABLE "Subscription"
      ADD CONSTRAINT "Subscription_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ── Unique + indexes ──────────────────────────────────────────────────────────
-- One subscription per org, enforced at the DB so a concurrent lazy-create races
-- to a P2002 rather than to two rows disagreeing about what the org owes.
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_organizationId_key"
  ON "Subscription" ("organizationId");
-- The webhook's fallback lookup when an event carries no organizationId metadata.
CREATE INDEX IF NOT EXISTS "Subscription_stripeCustomerId_idx"
  ON "Subscription" ("stripeCustomerId");

-- ── Status CHECK (mirrors lib/state/subscription-status.ts) ───────────────────
-- The middle five names are Stripe's own subscription statuses, kept verbatim so
-- the webhook can store what Stripe reports without a translation table.
-- 'free' (never converted) and 'quote_pending' (past the 121-member self-serve
-- ceiling, sales conversation open) are ours; Stripe has no equivalent.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_status_check') THEN
    ALTER TABLE "Subscription"
      ADD CONSTRAINT "subscription_status_check"
      CHECK (status IN ('free', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'quote_pending'));
  END IF;
END $$;

-- ── Tier CHECK (mirrors lib/state/billing-tier.ts) ────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_tier_check') THEN
    ALTER TABLE "Subscription"
      ADD CONSTRAINT "subscription_tier_check"
      CHECK (tier IN ('free', 'standard', 'pro', 'custom'));
  END IF;
END $$;

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Subscription" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "Subscription_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + enforcing org_isolation (Phase 4 — no allow_all) ───────────
-- NOTE for the webhook: figurints_app is NOBYPASSRLS and a Stripe delivery has no
-- org context to SET LOCAL, so webhook writes MUST go through prismaPrivileged
-- (DIRECT_URL / postgres, BYPASSRLS). Reads on behalf of a signed-in admin go
-- through ctx.db as normal.
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON "Subscription";
CREATE POLICY org_isolation ON "Subscription"
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

-- ═══════════════════════════════════════════════════════════════════════════════
-- StripeEvent  (GLOBAL — not org-scoped)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Webhook idempotency ledger, keyed by Stripe's own event id so a replayed
-- delivery collides on INSERT and is skipped. Stripe retries for up to three days
-- and does not promise at-most-once delivery, so this is not optional.
--
-- It cannot carry an organizationId: an event may arrive before we can resolve
-- which org it belongs to, or for an org that has since been deleted, and
-- dropping those on the floor would break idempotency exactly when it matters.
-- So, like PlatformAdmin, it gets a permissive allow_all policy. There is no
-- tenant data here — an event id and a type string.
--
-- TEXT primary key (Stripe's "evt_..."), hence no sequence and no sequence GRANT.

CREATE TABLE IF NOT EXISTS "StripeEvent" (
  "id"          TEXT PRIMARY KEY,
  "type"        TEXT NOT NULL,
  "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "error"       TEXT
);

CREATE INDEX IF NOT EXISTS "StripeEvent_type_receivedAt_idx"
  ON "StripeEvent" ("type", "receivedAt");

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "StripeEvent" TO figurints_app;
  END IF;
END $$;

ALTER TABLE "StripeEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "StripeEvent";
CREATE POLICY allow_all ON "StripeEvent" USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SalesLead
-- ═══════════════════════════════════════════════════════════════════════════════
-- A "talk to us" request: an org past the 120-member self-serve ceiling, or one
-- person administering several orgs who wants a group plan. Written before the
-- prefilled mail draft is handed back to the browser, so the lead survives the
-- user closing the compose window.
--
-- organizationId is nullable with ON DELETE SET NULL: losing the org must not
-- lose the pipeline record.

CREATE TABLE IF NOT EXISTS "SalesLead" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER,
  "brotherId"      INTEGER,
  "kind"           TEXT NOT NULL,
  "memberCount"    INTEGER NOT NULL DEFAULT 0,
  "contactName"    TEXT NOT NULL,
  "contactEmail"   TEXT NOT NULL,
  "message"        TEXT,
  "status"         TEXT NOT NULL DEFAULT 'new',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
-- SET NULL, not CASCADE: a lead outlives the org it came from. brotherId is
-- deliberately left WITHOUT a FK — a lead may name someone who is later removed
-- from the roster, and the contact name/email columns are the durable record.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesLead_organizationId_fkey') THEN
    ALTER TABLE "SalesLead"
      ADD CONSTRAINT "SalesLead_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "SalesLead_organizationId_idx"
  ON "SalesLead" ("organizationId");
CREATE INDEX IF NOT EXISTS "SalesLead_status_createdAt_idx"
  ON "SalesLead" ("status", "createdAt");

-- ── CHECKs (mirror lib/state/sales-lead.ts) ───────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_lead_kind_check') THEN
    ALTER TABLE "SalesLead"
      ADD CONSTRAINT "sales_lead_kind_check"
      CHECK (kind IN ('quote', 'multi_org'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_lead_status_check') THEN
    ALTER TABLE "SalesLead"
      ADD CONSTRAINT "sales_lead_status_check"
      CHECK (status IN ('new', 'contacted', 'closed'));
  END IF;
END $$;

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "SalesLead" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "SalesLead_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + enforcing org_isolation (Phase 4 — no allow_all) ───────────
-- organizationId is nullable here, and `NULL = <int>` is NULL (not true), so an
-- orphaned lead is invisible to the org-scoped client by construction. That is
-- intended: an orphaned lead belongs to the platform-admin surface, which reads
-- it through prismaPrivileged.
ALTER TABLE "SalesLead" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON "SalesLead";
CREATE POLICY org_isolation ON "SalesLead"
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);
