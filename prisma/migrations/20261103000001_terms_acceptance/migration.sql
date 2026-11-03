-- Terms of Service acceptance records: who agreed to which version, and where.
--
-- Additive: one new table. GLOBAL (keyed by the Google account id, not by org),
-- because a join request agrees before any Brother or Membership exists.
--
-- Access: RLS on with NO policy, the posture StripeEvent and OrphanedSubscription
-- have since 20261102000001_revoke_supabase_api_roles. Every reader and writer
-- goes through prismaPrivileged (BYPASSRLS); figurints_app gets no grant, and the
-- Supabase Data API roles get nothing.

-- CreateTable
CREATE TABLE "TermsAcceptance" (
    "id" SERIAL NOT NULL,
    "authUserId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "organizationId" INTEGER,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT terms_acceptance_context CHECK ("context" IN ('create', 'join', 'prompt'))
);

-- CreateIndex
CREATE INDEX "TermsAcceptance_authUserId_acceptedAt_idx" ON "TermsAcceptance"("authUserId", "acceptedAt");

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TermsAcceptance" ENABLE ROW LEVEL SECURITY;

-- Belt and braces: the default-privilege revoke in the previous migration already
-- covers new tables created by postgres, but a migration run as another role
-- would not be.
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role);
    EXECUTE format('REVOKE ALL ON "TermsAcceptance" FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON SEQUENCE "TermsAcceptance_id_seq" FROM %I', api_role);
  END LOOP;
END $$;
