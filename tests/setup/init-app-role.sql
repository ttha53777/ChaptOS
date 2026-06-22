-- Create the non-BYPASSRLS application-equivalent role for RLS-enforced tests.
--
-- WHY: the default test role (figurints_test = POSTGRES_USER) owns the schema and
-- therefore effectively bypasses RLS — so the existing suite validates only the
-- *application* wrapper, never the DB policies. Production connects as
-- `figurints_app` (rolbypassrls = false). This role mirrors that posture so
-- tests/tenancy/rls-enforced.test.ts can prove the policies actually isolate.
--
-- Runs once at container init (docker-entrypoint-initdb.d). The role is
-- cluster-level, so it survives `prisma db push --force-reset` (which only
-- recreates the schema). GRANTs and RLS policies are (re)applied per-run by the
-- test harness AFTER db push, because the schema — and thus its objects — is
-- dropped and recreated on every run.
--
-- NOSUPERUSER + NOBYPASSRLS are the load-bearing attributes: a superuser or a
-- BYPASSRLS role would silently pass every RLS test.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_test_app') THEN
    CREATE ROLE figurints_test_app LOGIN PASSWORD 'figurints_test_app'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Allow the app role to connect to the test database.
GRANT CONNECT ON DATABASE figurints_test TO figurints_test_app;
GRANT USAGE ON SCHEMA public TO figurints_test_app;
