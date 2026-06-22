-- Phase 4 revert: restore allow_all USING(true) on every org-scoped table.
--
-- ── When to apply ────────────────────────────────────────────────────────────
-- Apply this migration (Lever B) if Phase 4 (20260622000001_phase4_drop_allow_all)
-- needs to be rolled back. This restores the permissive dual-policy state from
-- Phase 3: both allow_all and org_isolation coexist, Postgres OR's them, and every
-- row is visible again regardless of whether app.org_id is set.
--
-- Lever B is always the correct rollback for traffic problems. Lever A
-- (RLS_SET_ORG_ID=0) stops further queries from failing but does NOT unblock
-- queries that already reached the DB without app.org_id — apply Lever B first.
--
-- ── What this does ───────────────────────────────────────────────────────────
-- Recreates allow_all USING(true) WITH CHECK(true) on all org-scoped tables
-- (31 total). Existing org_isolation policies are left in place — this migration
-- does NOT revert Phase 3. The result is the same inert dual-policy state Phase 3
-- shipped: org_isolation exists but allow_all OR's it away.
--
-- Template: 20260601000003_rls_revert_to_permissive (the proven prior revert).
--
-- Idempotent: DROP IF EXISTS before each CREATE so re-applying is safe.

-- ============================================================
-- Section B: org-column tables
-- ============================================================

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'Brother', 'Role', 'Semester', 'InstagramTask', 'Doc',
    'PartyEvent', 'CalendarEvent', 'ServiceEvent', 'ActivityLog',
    'Transaction', 'Budget', 'ChapterAnnouncement', 'Membership',
    'OperationalEvent', 'OrganizationConfig',
    'ProgrammingEvent', 'ProgrammingEventDoc', 'ProgrammingChecklistItem',
    'Task', 'TaskAssignment',
    'OrgInvite', 'OrgMetricDefinition', 'BrotherMetricValue',
    'Reimbursement', 'ServiceParticipation',
    'BrotherRole'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', tbl);
    EXECUTE format('CREATE POLICY allow_all ON %I USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;

-- ============================================================
-- Section C: join tables (no WITH CHECK — no direct INSERT path via app role)
-- ============================================================

DROP POLICY IF EXISTS allow_all ON "AttendanceRecord";
CREATE POLICY allow_all ON "AttendanceRecord" USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all ON "AttendanceExcuse";
CREATE POLICY allow_all ON "AttendanceExcuse" USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all ON "BudgetAllocation";
CREATE POLICY allow_all ON "BudgetAllocation" USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all ON "InviteRedemption";
CREATE POLICY allow_all ON "InviteRedemption" USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all ON "TransactionCalendarEvent";
CREATE POLICY allow_all ON "TransactionCalendarEvent" USING (true) WITH CHECK (true);

-- ============================================================
-- Section D: Organization root
-- ============================================================

DROP POLICY IF EXISTS allow_all ON "Organization";
CREATE POLICY allow_all ON "Organization" USING (true);
