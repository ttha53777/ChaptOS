-- Add an admin-chosen sidebar order to OrganizationConfig.
--
-- navOrder is a sparse list of nav labels (e.g. {"Treasury","Docs"}). The
-- sidebar sorts each nav GROUP by this list, appending any labels it doesn't
-- mention in their default order — so an empty array (the default) renders the
-- sidebar exactly as before, and a brand-new page added in a later release shows
-- up in its default slot without anyone re-saving. See lib/nav-order.ts.
--
-- No new table/sequence, so no app-role GRANT or RLS boilerplate is needed —
-- OrganizationConfig already carries those (see its create migration). The
-- column inherits the table's existing grants and org_isolation policy.
--
-- Default [] means "use the default order", so existing rows need no backfill.

ALTER TABLE "OrganizationConfig"
  ADD COLUMN IF NOT EXISTS "navOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
