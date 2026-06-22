-- Phase 4: Flip RLS to enforcing — drop the allow_all permissive policies.
--
-- ── What this does ──────────────────────────────────────────────────────────
-- Phase 3 (20260622000000_phase3_rls_policies) added org_isolation enforcing
-- policies to every org-scoped table while leaving allow_all in place. Postgres
-- combines permissive policies with OR, so `allow_all USING(true)` OR'd with
-- org_isolation still let every row through — Phase 3 was behaviorally inert.
--
-- This migration drops allow_all on every org-scoped table, leaving org_isolation
-- as the only policy. From this point:
--   • figurints_app (NOBYPASSRLS, normal app traffic) — filtered by org_isolation:
--     queries see only the rows belonging to the org set in app.org_id.
--   • prismaPrivileged / postgres (BYPASSRLS) — unaffected; used only for
--     bootstrap paths (claim, redeem-invite, provisionOrg) that predate tenant ctx.
--   • PlatformAdmin — untouched; remains under allow_all (global table, no org col).
--
-- ── Prerequisite ────────────────────────────────────────────────────────────
-- RLS_SET_ORG_ID=1 must be active before applying this migration in any
-- environment. With allow_all gone, any query that reaches the DB without
-- SET LOCAL app.org_id will see ZERO rows (the safe failure mode), not all rows.
-- Confirm `RLS_SET_ORG_ID=1` is in the env before running `prisma migrate deploy`.
--
-- ── Rollback levers ─────────────────────────────────────────────────────────
-- Lever A (instant, no deploy): set RLS_SET_ORG_ID=0 — stops db() from issuing
--   SET LOCAL, so app.org_id stays unset and every enforcing-policy query returns
--   zero rows.  This is a "fail loudly" lever useful for diagnosing a problem but
--   NOT a safe traffic lever by itself.
-- Lever B (safe revert, seconds): apply the pre-staged revert migration
--   20260622000002_phase4_revert_allow_all — recreates allow_all USING(true) on
--   every table, restoring the permissive state immediately.
-- Both levers are independent and can be combined. Always use Lever B for traffic.
--
-- ── Tables mirrored from Phase 3 ────────────────────────────────────────────
-- Org-column tables (Section B in Phase 3):
--   Brother, Role, Semester, InstagramTask, Doc, PartyEvent, CalendarEvent,
--   ServiceEvent, ActivityLog, Transaction, Budget, ChapterAnnouncement,
--   Membership, OperationalEvent, OrganizationConfig, ProgrammingEvent,
--   ProgrammingEventDoc, ProgrammingChecklistItem, Task, TaskAssignment,
--   OrgInvite, OrgMetricDefinition, BrotherMetricValue, Reimbursement,
--   ServiceParticipation, BrotherRole
-- Join tables scoped via parent subquery (Section C):
--   AttendanceRecord, AttendanceExcuse, BudgetAllocation,
--   InviteRedemption, TransactionCalendarEvent
-- Organization root (Section D):
--   Organization
-- NOT touched:
--   PlatformAdmin — intentionally global; allow_all stays.

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
  END LOOP;
END $$;

-- ============================================================
-- Section C: join tables
-- ============================================================

DROP POLICY IF EXISTS allow_all ON "AttendanceRecord";
DROP POLICY IF EXISTS allow_all ON "AttendanceExcuse";
DROP POLICY IF EXISTS allow_all ON "BudgetAllocation";
DROP POLICY IF EXISTS allow_all ON "InviteRedemption";
DROP POLICY IF EXISTS allow_all ON "TransactionCalendarEvent";

-- ============================================================
-- Section D: Organization root
-- ============================================================

DROP POLICY IF EXISTS allow_all ON "Organization";

-- ============================================================
-- Verify: org_isolation still present on every table above.
-- This DO block raises an exception (aborting the migration) if
-- any table is left with zero policies after the DROP — which
-- would mean Phase 3 didn't run and we'd lock out all queries.
-- ============================================================

DO $$
DECLARE
  tbl text;
  cnt int;
  all_tables text[] := ARRAY[
    'Brother', 'Role', 'Semester', 'InstagramTask', 'Doc',
    'PartyEvent', 'CalendarEvent', 'ServiceEvent', 'ActivityLog',
    'Transaction', 'Budget', 'ChapterAnnouncement', 'Membership',
    'OperationalEvent', 'OrganizationConfig',
    'ProgrammingEvent', 'ProgrammingEventDoc', 'ProgrammingChecklistItem',
    'Task', 'TaskAssignment',
    'OrgInvite', 'OrgMetricDefinition', 'BrotherMetricValue',
    'Reimbursement', 'ServiceParticipation', 'BrotherRole',
    'AttendanceRecord', 'AttendanceExcuse', 'BudgetAllocation',
    'InviteRedemption', 'TransactionCalendarEvent',
    'Organization'
  ];
BEGIN
  FOREACH tbl IN ARRAY all_tables LOOP
    SELECT COUNT(*) INTO cnt
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = tbl
      AND policyname = 'org_isolation';
    IF cnt = 0 THEN
      RAISE EXCEPTION
        'Phase 4 safety check: org_isolation policy missing on %. Apply Phase 3 first.',
        tbl;
    END IF;
  END LOOP;
END $$;
