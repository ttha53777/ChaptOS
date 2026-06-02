-- Organization invite links: admin-generated, reusable-until-expiry/revoke links
-- that let a new person join an org. Two new tables:
--   OrgInvite        — the link itself (token, mode, expiry, revoke).
--   InviteRedemption — one row per successful join (audit + count).
--
-- Mirrors the conventions of the existing org-scoped tables: app-role GRANTs
-- (20260601000000_grant_org_create_to_app_role) + permissive allow_all RLS
-- (20260601000003_rls_revert_to_permissive). Tenant isolation is enforced at the
-- app layer (lib/db/tenant.ts appends organizationId); RLS is defense-in-depth
-- and stays permissive to match the current Phase 2.5 posture.

-- ── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE "OrgInvite" (
    "id"                 SERIAL       NOT NULL,
    "organizationId"     INTEGER      NOT NULL,
    "token"              TEXT         NOT NULL,
    "mode"               TEXT         NOT NULL,
    "expiresAt"          TIMESTAMP(3),
    "revokedAt"          TIMESTAMP(3),
    "createdByBrotherId" INTEGER      NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InviteRedemption" (
    "id"         SERIAL       NOT NULL,
    "inviteId"   INTEGER      NOT NULL,
    "brotherId"  INTEGER      NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteRedemption_pkey" PRIMARY KEY ("id")
);

-- ── Indexes / uniqueness ─────────────────────────────────────────────────────
CREATE UNIQUE INDEX "OrgInvite_token_key" ON "OrgInvite"("token");
CREATE INDEX "OrgInvite_organizationId_idx" ON "OrgInvite"("organizationId");
CREATE UNIQUE INDEX "InviteRedemption_inviteId_brotherId_key" ON "InviteRedemption"("inviteId", "brotherId");
CREATE INDEX "InviteRedemption_inviteId_idx" ON "InviteRedemption"("inviteId");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
ALTER TABLE "OrgInvite" ADD CONSTRAINT "OrgInvite_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrgInvite" ADD CONSTRAINT "OrgInvite_createdByBrotherId_fkey"
    FOREIGN KEY ("createdByBrotherId") REFERENCES "Brother"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InviteRedemption" ADD CONSTRAINT "InviteRedemption_inviteId_fkey"
    FOREIGN KEY ("inviteId") REFERENCES "OrgInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteRedemption" ADD CONSTRAINT "InviteRedemption_brotherId_fkey"
    FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CHECK constraint: mode is a stable enum (InviteMode in @/lib/state) ───────
ALTER TABLE "OrgInvite" ADD CONSTRAINT "OrgInvite_mode_check"
    CHECK ("mode" IN ('open', 'claim'));

-- ── App-role GRANTs ──────────────────────────────────────────────────────────
-- The figurints_app role (non-BYPASSRLS) must CRUD both tables: create/list/
-- revoke run through ctx.db (app role), and the pre-auth redeem route writes
-- redemptions + reads invites as the app role too. Guarded so dev DBs that still
-- connect as postgres (no figurints_app role) skip cleanly. GRANT is idempotent.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "OrgInvite"        TO figurints_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "InviteRedemption" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "OrgInvite_id_seq"        TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "InviteRedemption_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all, matching every other org-scoped table ─
-- (20260601000003_rls_revert_to_permissive). Real isolation is app-layer WHERE
-- scoping; flipping to enforcing is a separate, deliberate change.
ALTER TABLE "OrgInvite"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InviteRedemption" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "OrgInvite";
DROP POLICY IF EXISTS allow_all ON "InviteRedemption";
CREATE POLICY allow_all ON "OrgInvite"        USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON "InviteRedemption" USING (true) WITH CHECK (true);
