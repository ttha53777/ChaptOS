-- Revert RLS from enforcing back to PERMISSIVE (USING true) on all org-scoped
-- tables. This restores the "currently permissive" state described in AGENTS.md.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- Phase 2.5 (20260529000002_phase25_rls_enforce) flipped every org-scoped table
-- to an enforcing policy:
--     org_isolation USING (organizationId = NULLIF(current_setting('app.org_id', true), '')::int)
-- That migration's own header states it is safe ONLY because "Prisma currently
-- connects as the BYPASSRLS postgres role ... production behavior does not change
-- until you provision a non-BYPASSRLS app role."
--
-- That assumption no longer holds. The app now connects as `figurints_app`
-- (rolbypassrls = false) via DATABASE_URL. Crucially, the db() tenant wrapper
-- in lib/db/tenant.ts only sets app.org_id inside db().$transaction() — the
-- plain read methods (findMany / findFirst / count) do NOT open a transaction
-- and therefore never set app.org_id. Under the enforcing policy those reads
-- evaluate `organizationId = NULL` and return ZERO rows.
--
-- Net effect: every plain ctx.db read (the roster, dashboard, the /api/auth/claim
-- name match, etc.) silently returned empty. The first visible symptom was
-- "No brother found with that name" on the claim screen.
--
-- ── Why permissive is correct for now ───────────────────────────────────────
-- Tenant isolation is still enforced at the application layer: db() appends
-- `organizationId: orgId` to the WHERE clause of every scoped query, and writes
-- carry an explicit organizationId. RLS is intended as defense-in-depth, and
-- AGENTS.md documents the current rollout state as permissive. True RLS
-- enforcement requires first upgrading db()'s read paths to set app.org_id on
-- every query (not just transactions) — a separate, deliberate change.
--
-- ── What this does ──────────────────────────────────────────────────────────
--   * Drops org_isolation on all 17 org-scoped tables.
--   * Drops the org_public_read helper on Organization (20260601000002) — no
--     longer needed once Organization is fully permissive.
--   * Recreates allow_all USING (true) on each table.
-- RLS stays ENABLED on every table; only the policy expression changes.
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'Brother','Role','Semester','Deadline','InstagramTask','Doc',
    'PartyEvent','CalendarEvent','ServiceEvent','ActivityLog',
    'Transaction','Budget','ChapterAnnouncement','Membership',
    'OperationalEvent','OrganizationConfig'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', tbl);
    EXECUTE format('CREATE POLICY allow_all ON %I USING (true)', tbl);
  END LOOP;
END $$;

-- Organization: drop both the enforcing policy and the SELECT-only public-read
-- helper, replace with a single permissive allow_all.
DROP POLICY IF EXISTS org_isolation ON "Organization";
DROP POLICY IF EXISTS org_public_read ON "Organization";
DROP POLICY IF EXISTS allow_all ON "Organization";
CREATE POLICY allow_all ON "Organization" USING (true);
