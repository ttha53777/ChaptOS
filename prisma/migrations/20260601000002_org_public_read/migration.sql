-- Public read access to an organization's IDENTITY (name + slug) for the app role.
--
-- Why this is needed:
--   The Organization table has RLS enabled with a single FOR ALL policy
--   (org_isolation) whose USING clause is
--       id = NULLIF(current_setting('app.org_id', true), '')::integer
--   On any request WITHOUT org context (app.org_id unset), that comparison is
--   NULL, so the row is filtered out — even on SELECT. The figurints_app role
--   therefore sees ZERO organizations during the pre-auth onboarding flow.
--
--   This breaks two public, pre-auth endpoints that must read Organization
--   before any org context exists:
--     * GET /api/orgs/lookup     — "does this slug point to a real org?" (login)
--     * GET /api/orgs/slug-check — "is this slug taken?" (create-org form)
--   Symptom: lookup returned 404 for a valid slug ("lpe"); slug-check would
--   read a taken slug as available, risking duplicate-slug provisioning.
--
-- Why this is safe:
--   An organization's slug + name are its PUBLIC identity — the login surface,
--   not tenant-private data. /api/orgs/lookup already returns only { name, slug }
--   by design and documents that slug existence is intentionally enumerable
--   (rate-limited, reserved-list-capped). Exposing these columns for SELECT
--   does not leak any member, financial, or operational data.
--
-- Mechanism:
--   Postgres OR-combines PERMISSIVE policies. Adding a second PERMISSIVE policy
--   scoped to FOR SELECT with USING (true) makes Organization rows readable
--   regardless of app.org_id, while leaving writes (INSERT/UPDATE/DELETE) still
--   governed solely by org_isolation. This is strictly a read-side relaxation.
--
-- Idempotent: DROP POLICY IF EXISTS before CREATE.

DROP POLICY IF EXISTS org_public_read ON "Organization";
CREATE POLICY org_public_read ON "Organization"
  FOR SELECT
  USING (true);
