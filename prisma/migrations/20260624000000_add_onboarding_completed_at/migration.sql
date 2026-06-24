-- Add an explicit onboarding-completion marker to OrganizationConfig.
--
-- Until now "is onboarding finished?" was inferred from
-- enabledWorkflows.length === 0 — but provisionOrg seeds workflows from the
-- org-type template at creation, so that array is NEVER empty. The gate was
-- therefore enforced only by the /[slug]/onboarding route itself, so a founder
-- who closed the tab mid-setup was silently treated as done and could never
-- resume. This column makes completion authoritative and explicit.
--
-- No new table/sequence, so no app-role GRANT or RLS boilerplate is needed —
-- OrganizationConfig already carries those (see its create migration). The
-- column inherits the table's existing grants and org_isolation policy.

ALTER TABLE "OrganizationConfig"
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill existing orgs as already-onboarded so they aren't bounced back into
-- the wizard. New orgs are created with NULL and stamped when the founder
-- finishes setup.
UPDATE "OrganizationConfig"
  SET "onboardingCompletedAt" = "createdAt"
  WHERE "onboardingCompletedAt" IS NULL;
