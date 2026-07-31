-- OrphanedSubscription — subscriptions we failed to cancel during org deletion.
--
-- ── Why this table exists ─────────────────────────────────────────────────────
--
-- deleteOrg (lib/services/org-service.ts) cancels the Stripe subscription BEFORE
-- tearing the org down, and deliberately swallows a cancellation failure rather
-- than blocking the deletion: leaving an org the admin asked to delete in a
-- half-alive state is judged the worse outcome.
--
-- The gap that leaves: the teardown deletes the Subscription row, which held the
-- only copy of stripeSubscriptionId. A transient network failure during
-- cancellation therefore turned into an indefinite charge against a customer
-- whose org no longer exists, with a single log line as the only trace. Unlike
-- seat-sync drift — which has seatSyncPendingAt and three paths that clear it —
-- there was nothing durable to retry from.
--
-- ── Why GLOBAL (no org scoping) ───────────────────────────────────────────────
--
-- The org is deleted by design, so there is nothing to scope to. organizationId
-- is a plain integer with NO foreign key: a FK would either block the delete or
-- cascade away the very evidence this row exists to preserve. Like StripeEvent
-- and PlatformAdmin, it therefore takes a permissive allow_all policy rather than
-- org_isolation — an org_isolation policy here would make the table invisible to
-- every reader, since no app.org_id can meaningfully apply to a deleted org.
--
-- Holds no tenant data beyond the org's name/slug, retained so whoever works the
-- queue knows which customer to contact.

CREATE TABLE IF NOT EXISTS "OrphanedSubscription" (
  "id"                   SERIAL PRIMARY KEY,
  "stripeSubscriptionId" TEXT NOT NULL,
  "stripeCustomerId"     TEXT,
  "organizationId"       INTEGER NOT NULL,
  "orgName"              TEXT,
  "orgSlug"              TEXT,
  "lastError"            TEXT,
  "failedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"           TIMESTAMP(3)
);

-- The working query is "what still needs cancelling", oldest first.
CREATE INDEX IF NOT EXISTS "OrphanedSubscription_resolvedAt_failedAt_idx"
  ON "OrphanedSubscription" ("resolvedAt", "failedAt");

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
-- The SEQUENCE grant is not optional: without it an app-role INSERT fails with
-- "permission denied for sequence OrphanedSubscription_id_seq", and the write
-- that records the orphan would itself be lost.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "OrphanedSubscription" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "OrphanedSubscription_id_seq" TO figurints_app;
  END IF;
END $$;

ALTER TABLE "OrphanedSubscription" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "OrphanedSubscription";
CREATE POLICY allow_all ON "OrphanedSubscription" USING (true) WITH CHECK (true);
