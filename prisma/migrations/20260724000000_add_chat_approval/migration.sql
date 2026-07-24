-- ChatApproval: the durable record behind Ask Chapt's "Approvals" view — one row
-- per chat proposal a member APPROVED, written at confirm time from the
-- HMAC-signed proposal blob (lib/ai-approval-sig.ts). Drafts, discards, and
-- blocked drafts leave no record; proposals themselves stay ephemeral.
-- approvedByName/Role are snapshots so the record keeps reading correctly after
-- roles change hands.
--
-- Idempotent (IF NOT EXISTS throughout). Carries the standard org-scoped-table
-- boilerplate: app-role CRUD + sequence grants (see
-- 20260611000004_programming_app_grants for the cautionary tale of omitting the
-- sequence grant) — and, since Phase 4 RLS is enforcing, a direct
-- `org_isolation` policy rather than the historical permissive allow_all.

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ChatApproval" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "kind"           TEXT NOT NULL,
  "action"         TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "summary"        TEXT NOT NULL,
  "rows"           JSONB NOT NULL,
  "permission"     TEXT NOT NULL,
  "permLabel"      TEXT NOT NULL,
  "approvedById"   INTEGER NOT NULL,
  "approvedByName" TEXT NOT NULL,
  "approvedByRole" TEXT NOT NULL,
  "subjectType"    TEXT,
  "subjectId"      INTEGER,
  "requestId"      TEXT,
  "approvedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatApproval_organizationId_fkey') THEN
    ALTER TABLE "ChatApproval"
      ADD CONSTRAINT "ChatApproval_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatApproval_approvedById_fkey') THEN
    ALTER TABLE "ChatApproval"
      ADD CONSTRAINT "ChatApproval_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "Brother"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "ChatApproval_organizationId_approvedAt_idx"
  ON "ChatApproval" ("organizationId", "approvedAt" DESC);
CREATE INDEX IF NOT EXISTS "ChatApproval_approvedById_idx"
  ON "ChatApproval" ("approvedById");

-- ── Kind CHECK (mirrors lib/state/approval-kind.ts / PROPOSAL_META kinds) ─────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_approval_kind_check') THEN
    ALTER TABLE "ChatApproval"
      ADD CONSTRAINT "chat_approval_kind_check"
      CHECK (kind IN ('timeline', 'instagram', 'events', 'treasury', 'dues', 'programming'));
  END IF;
END $$;

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ChatApproval" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "ChatApproval_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + enforcing org_isolation (Phase 4 — no allow_all) ───────────
ALTER TABLE "ChatApproval" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON "ChatApproval";
CREATE POLICY org_isolation ON "ChatApproval"
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);
