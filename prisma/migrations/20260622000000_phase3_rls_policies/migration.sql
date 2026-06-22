-- Phase 3: RLS policy coverage — behaviorally inert dual-policy layer.
--
-- ── Goal ────────────────────────────────────────────────────────────────────
-- Every org-scoped table gets a named enforcing `org_isolation` policy that
-- mirrors what Phase 4 will activate. This migration is a NO-OP in production:
-- Postgres combines permissive policies with OR, so `allow_all USING(true)` ORed
-- with `org_isolation` still lets every row through. The enforcing read happens
-- only after Phase 4 DROPs allow_all.
--
-- ── Design ──────────────────────────────────────────────────────────────────
-- * allow_all is NOT dropped here. Phase 4 drops it with one statement per table.
-- * Both policies are idempotent: DROP POLICY IF EXISTS before each CREATE.
-- * Policy expressions are copied verbatim from tests/setup/rls.ts
--   (applyEnforcingRls / RELATION_SCOPED), which is the authoritative source of
--   truth. Any future drift must be reconciled there first.
-- * The org_var expression `NULLIF(current_setting('app.org_id', true), '')::integer`
--   returns NULL when the session var is unset (the `true` arg suppresses the
--   "unrecognized configuration parameter" error). Unset ↔ NULL means every
--   org-column comparison fails → zero rows (safe default).
--
-- ── What this migration does ─────────────────────────────────────────────────
-- Section A  Enable RLS + add allow_all on the 4 tables that have NEITHER today:
--              BrotherRole, AttendanceRecord, AttendanceExcuse, BudgetAllocation.
-- Section B  Add org_isolation to all org-column tables (26 total), both the
--              tables that already had allow_all and the Section A tables.
-- Section C  Add org_isolation to join tables via parent EXISTS-subquery.
-- Section D  Organization root: scope by id (the row IS the org).
-- Section E  GRANTs: ensure figurints_app has SELECT on the parent tables the
--              Section C subqueries reference (CalendarEvent, Brother, Budget,
--              OrgInvite, Transaction). These were granted in earlier migrations
--              but are re-checked idempotently here in case a future schema reset
--              drops them.
-- Section F  PlatformAdmin stays permissive (global table, no org column).
--
-- ── Tables NOT touched ───────────────────────────────────────────────────────
-- * Deadline — dropped by 20260619000000_add_tasks_supersede_deadlines.
-- * PlatformAdmin — intentionally global (see Section F note).

-- ============================================================
-- Section A: Enable RLS on the 4 tables that currently have none
-- (BrotherRole was added in 20260530000000_brotherole_org_id without RLS)
-- ============================================================

ALTER TABLE "BrotherRole" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "BrotherRole";
CREATE POLICY allow_all ON "BrotherRole" USING (true) WITH CHECK (true);

ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "AttendanceRecord";
CREATE POLICY allow_all ON "AttendanceRecord" USING (true) WITH CHECK (true);

ALTER TABLE "AttendanceExcuse" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "AttendanceExcuse";
CREATE POLICY allow_all ON "AttendanceExcuse" USING (true) WITH CHECK (true);

ALTER TABLE "BudgetAllocation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "BudgetAllocation";
CREATE POLICY allow_all ON "BudgetAllocation" USING (true) WITH CHECK (true);

-- ============================================================
-- Section B: org_isolation on all org-column tables
--
-- Expression: "organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
-- WITH CHECK mirrors USING so writes to the wrong org are also rejected.
-- ============================================================

DO $$
DECLARE
  tbl text;
  org_var text := $v$NULLIF(current_setting('app.org_id', true), '')::integer$v$;
  tables text[] := ARRAY[
    -- Original Phase 1 set (Brother..Membership already have allow_all)
    'Brother', 'Role', 'Semester', 'InstagramTask', 'Doc',
    'PartyEvent', 'CalendarEvent', 'ServiceEvent', 'ActivityLog',
    'Transaction', 'Budget', 'ChapterAnnouncement', 'Membership',
    -- Phase 2.5+ tables that already have allow_all
    'OperationalEvent', 'OrganizationConfig',
    'ProgrammingEvent', 'ProgrammingEventDoc', 'ProgrammingChecklistItem',
    'Task', 'TaskAssignment',
    'OrgInvite', 'OrgMetricDefinition', 'BrotherMetricValue',
    'Reimbursement', 'ServiceParticipation',
    -- Section A: now also have allow_all (just added above)
    'BrotherRole'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', tbl);
    EXECUTE format(
      $sql$CREATE POLICY org_isolation ON %I
           USING ("organizationId" = %s)
           WITH CHECK ("organizationId" = %s)$sql$,
      tbl, org_var, org_var
    );
  END LOOP;
END $$;

-- ============================================================
-- Section C: Join-table org_isolation via parent EXISTS-subquery
--
-- These tables have no organizationId column; they are scoped by requiring
-- that their parent row belongs to the active org. Shapes copied from
-- tests/setup/rls.ts RELATION_SCOPED array (the Phase 3 source of truth).
--
-- Parent tables referenced in subqueries:
--   AttendanceRecord  → CalendarEvent  (fk: calendarEventId)
--   AttendanceExcuse  → Brother        (fk: brotherId)
--   BudgetAllocation  → Budget         (fk: budgetId)
--   InviteRedemption  → OrgInvite      (fk: inviteId)
--   TransactionCalendarEvent → Transaction (fk: transactionId)
-- ============================================================

-- AttendanceRecord → CalendarEvent
DROP POLICY IF EXISTS org_isolation ON "AttendanceRecord";
CREATE POLICY org_isolation ON "AttendanceRecord"
  USING (EXISTS (
    SELECT 1 FROM "CalendarEvent" p
    WHERE p."id" = "AttendanceRecord"."calendarEventId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "CalendarEvent" p
    WHERE p."id" = "AttendanceRecord"."calendarEventId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ));

-- AttendanceExcuse → Brother
DROP POLICY IF EXISTS org_isolation ON "AttendanceExcuse";
CREATE POLICY org_isolation ON "AttendanceExcuse"
  USING (EXISTS (
    SELECT 1 FROM "Brother" p
    WHERE p."id" = "AttendanceExcuse"."brotherId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Brother" p
    WHERE p."id" = "AttendanceExcuse"."brotherId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ));

-- BudgetAllocation → Budget
DROP POLICY IF EXISTS org_isolation ON "BudgetAllocation";
CREATE POLICY org_isolation ON "BudgetAllocation"
  USING (EXISTS (
    SELECT 1 FROM "Budget" p
    WHERE p."id" = "BudgetAllocation"."budgetId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Budget" p
    WHERE p."id" = "BudgetAllocation"."budgetId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ));

-- InviteRedemption → OrgInvite
DROP POLICY IF EXISTS org_isolation ON "InviteRedemption";
CREATE POLICY org_isolation ON "InviteRedemption"
  USING (EXISTS (
    SELECT 1 FROM "OrgInvite" p
    WHERE p."id" = "InviteRedemption"."inviteId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "OrgInvite" p
    WHERE p."id" = "InviteRedemption"."inviteId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ));

-- TransactionCalendarEvent → Transaction
DROP POLICY IF EXISTS org_isolation ON "TransactionCalendarEvent";
CREATE POLICY org_isolation ON "TransactionCalendarEvent"
  USING (EXISTS (
    SELECT 1 FROM "Transaction" p
    WHERE p."id" = "TransactionCalendarEvent"."transactionId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Transaction" p
    WHERE p."id" = "TransactionCalendarEvent"."transactionId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ));

-- ============================================================
-- Section D: Organization root — scope by id (no organizationId column)
--
-- Expression mirrors tests/setup/rls.ts:
--   USING ("id" = NULLIF(current_setting('app.org_id', true), '')::integer)
-- No WITH CHECK needed: the production bootstrap path (org creation) runs as
-- prismaPrivileged (BYPASSRLS), so the app role never INSERTs here.
-- ============================================================

DROP POLICY IF EXISTS org_isolation ON "Organization";
CREATE POLICY org_isolation ON "Organization"
  USING ("id" = NULLIF(current_setting('app.org_id', true), '')::integer);

-- ============================================================
-- Section E: Ensure figurints_app can SELECT the parent tables referenced
-- in Section C subqueries. Earlier migrations grant these, but they are
-- recreated here idempotently so a schema reset doesn't silently break the
-- subquery policies (SELECT denial would cause the policy check to error,
-- not just return false).
-- ============================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT ON "CalendarEvent"  TO figurints_app;
    GRANT SELECT ON "Brother"        TO figurints_app;
    GRANT SELECT ON "Budget"         TO figurints_app;
    GRANT SELECT ON "OrgInvite"      TO figurints_app;
    GRANT SELECT ON "Transaction"    TO figurints_app;
  END IF;
END $$;

-- ============================================================
-- Section F: PlatformAdmin — stays permissive (no org column, global table)
-- The existing allow_all from Phase 1 is correct. Nothing to change.
-- ============================================================
