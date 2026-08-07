-- JoinRequest: the waiting room between an invite link and a roster spot.
--
-- Before this, holding an invite URL WAS access — /api/auth/redeem-invite wrote
-- a Membership on the spot and no officer ever saw the name. Now opening a link
-- files a row here, and only an officer's approval mints the Brother +
-- Membership. Nothing about an unreviewed person exists in any org-scoped table,
-- which is why this table carries authUserId/email/name itself instead of
-- pointing at a Brother that doesn't exist yet.
--
-- @@unique(organizationId, authUserId) is load-bearing, not just hygiene: one
-- row per person per org, REUSED across links. A rejected row stays put, so
-- re-clicking the same link is refused while a different link an officer sent
-- resets it to pending. That is "you need a new link to try again", with no
-- second table and no way to spam the queue by reloading.
--
-- Also drops OrgInvite.mode. It chose between "create a new member" and "match
-- an existing roster name"; the second branch existed only to serve
-- officer-typed roster rows, which 20260807000001 removes.
--
-- Idempotent (IF NOT EXISTS throughout). Carries the standard org-scoped-table
-- boilerplate: app-role CRUD + sequence grants (see
-- 20260611000004_programming_app_grants for the cautionary tale of omitting the
-- sequence grant) — and, since Phase 4 RLS is enforcing, a direct
-- `org_isolation` policy rather than the historical permissive allow_all.

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "JoinRequest" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "inviteId"       INTEGER NOT NULL,
  "authUserId"     TEXT NOT NULL,
  "email"          TEXT,
  "avatarUrl"      TEXT,
  "name"           TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt"      TIMESTAMP(3),
  "decidedById"    INTEGER,
  "brotherId"      INTEGER
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
-- decidedById / brotherId are SET NULL, matching the posture
-- 20260801000000_member_erasure_fks established for OrgInvite.createdByBrotherId:
-- a decision is org property that outlives the officer who made it, and removing
-- an approved member should leave the trail of how they got in.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JoinRequest_organizationId_fkey') THEN
    ALTER TABLE "JoinRequest"
      ADD CONSTRAINT "JoinRequest_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JoinRequest_inviteId_fkey') THEN
    ALTER TABLE "JoinRequest"
      ADD CONSTRAINT "JoinRequest_inviteId_fkey"
      FOREIGN KEY ("inviteId") REFERENCES "OrgInvite"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JoinRequest_decidedById_fkey') THEN
    ALTER TABLE "JoinRequest"
      ADD CONSTRAINT "JoinRequest_decidedById_fkey"
      FOREIGN KEY ("decidedById") REFERENCES "Brother"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JoinRequest_brotherId_fkey') THEN
    ALTER TABLE "JoinRequest"
      ADD CONSTRAINT "JoinRequest_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "JoinRequest_organizationId_authUserId_key"
  ON "JoinRequest" ("organizationId", "authUserId");
CREATE INDEX IF NOT EXISTS "JoinRequest_organizationId_status_createdAt_idx"
  ON "JoinRequest" ("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "JoinRequest_inviteId_idx"
  ON "JoinRequest" ("inviteId");

-- ── Status CHECK (mirrors lib/state/join-request-status.ts) ───────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'join_request_status_check') THEN
    ALTER TABLE "JoinRequest"
      ADD CONSTRAINT "join_request_status_check"
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "JoinRequest" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "JoinRequest_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + enforcing org_isolation (Phase 4 — no allow_all) ───────────
--
-- NOTE for anyone touching the submit path: this policy is why
-- lib/auth/join-request-submit.ts uses prismaPrivileged. A person filing a
-- request has no membership anywhere, so there is no app.org_id to SET LOCAL,
-- and the app role would return [] SILENTLY rather than error — which reads as
-- "no existing request" and would mint a duplicate on every reload.
ALTER TABLE "JoinRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON "JoinRequest";
CREATE POLICY org_isolation ON "JoinRequest"
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

-- ── Drop OrgInvite.mode ───────────────────────────────────────────────────────
ALTER TABLE "OrgInvite" DROP COLUMN IF EXISTS "mode";
