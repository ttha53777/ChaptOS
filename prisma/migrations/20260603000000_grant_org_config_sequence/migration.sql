-- Grant USAGE on OrganizationConfig's id sequence to the figurints_app role.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- 20260601000000_grant_org_create_to_app_role granted the app role table-level
-- INSERT/UPDATE/DELETE on "OrganizationConfig", but NOT usage on its identity
-- sequence. The one-time `GRANT USAGE ON ALL SEQUENCES IN SCHEMA public` in
-- 20260530000001_figurints_app_role only covered sequences that existed at that
-- moment; "OrganizationConfig" (and its sequence) were created later in
-- 20260531000000_org_type_and_config, so the app role never got USAGE on it.
--
-- Provisioning didn't expose this because provisionOrg() inserts the config row
-- as the BYPASSRLS postgres role (prismaPrivileged). The first app-role INSERT
-- into "OrganizationConfig" — the post-creation page-picker write via
-- setWorkflows()/ctx.db.organizationConfig.upsert() — trips:
--     permission denied for sequence OrganizationConfig_id_seq
-- on the INSERT branch any upsert prepares (nextval on the id sequence).
--
-- This mirrors how 20260602000000_org_invites explicitly granted USAGE, SELECT
-- on its own new sequences. Same fix, retroactive for OrganizationConfig.
--
-- Idempotent: GRANT is a no-op when re-applied. Guarded so dev DBs that still
-- connect as the postgres role (no figurints_app role) skip cleanly.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT USAGE, SELECT ON SEQUENCE "OrganizationConfig_id_seq" TO figurints_app;
  END IF;
END $$;
