-- Backfill app-role GRANTs + RLS for ProgrammingEvent and ProgrammingEventDoc.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The original 20260611000001_programming_ops_matrix migration created
-- "ProgrammingEvent" and "ProgrammingEventDoc" but omitted the app-role GRANT /
-- sequence-grant / RLS block that every other org-scoped table carries. As a
-- result figurints_app (the non-BYPASSRLS role the app connects as through the
-- pooler) had NO privileges on these tables — every read 500'd with
-- "permission denied for table ProgrammingEvent". It went unnoticed because the
-- old spreadsheet UI fetched lazily; the Kanban board fetches on load and
-- surfaced it immediately.
--
-- This migration is idempotent and brings both tables in line with the
-- convention (see 20260611000003_programming_checklist): app-role CRUD grants,
-- sequence USAGE/SELECT (or INSERT fails with "permission denied for sequence"),
-- permissive allow_all RLS as defense-in-depth. Tenant isolation stays at the
-- app layer (lib/db/tenant.ts appends organizationId).

-- ── App-role GRANTs ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProgrammingEvent" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "ProgrammingEvent_id_seq" TO figurints_app;

    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProgrammingEventDoc" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "ProgrammingEventDoc_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all ──────────────────────────────────────
ALTER TABLE "ProgrammingEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "ProgrammingEvent";
CREATE POLICY allow_all ON "ProgrammingEvent" USING (true) WITH CHECK (true);

ALTER TABLE "ProgrammingEventDoc" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "ProgrammingEventDoc";
CREATE POLICY allow_all ON "ProgrammingEventDoc" USING (true) WITH CHECK (true);
