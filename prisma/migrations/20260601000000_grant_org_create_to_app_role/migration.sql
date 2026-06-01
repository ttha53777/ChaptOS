-- Self-serve org creation requires the figurints_app role to write Organization
-- rows (previously SELECT-only — orgs were created via migration/seed) and to
-- CRUD the new OrganizationConfig table added in 20260531000000_org_type_and_config.
--
-- Without these grants provisionOrg() trips a "permission denied for table
-- Organization" runtime error on first insert.
--
-- Idempotent: GRANT is itself idempotent in Postgres (re-granting the same
-- privilege is a no-op), and the DO block guards the role check so this is
-- safe on environments that don't have the figurints_app role provisioned yet
-- (e.g. dev DBs that still connect as postgres).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    -- Org rows are now mutable at runtime by the app role (self-serve create
    -- + Milestone-3 createdByBrotherId backfill within the same transaction).
    GRANT INSERT, UPDATE ON "Organization" TO figurints_app;

    -- New table from Milestone 1 was never granted; provisionOrg writes a
    -- config row per provisioned org.
    GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationConfig" TO figurints_app;
  END IF;
END $$;
