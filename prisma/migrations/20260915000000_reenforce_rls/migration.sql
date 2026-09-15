-- Re-enforce tenant RLS after the emergency Phase 4 revert was inadvertently
-- applied as part of the normal Prisma migration chain.
--
-- This is deliberately a new forward migration. Never edit or delete the
-- already-applied Phase 4 migrations: doing so would create migration-history
-- drift without changing the live database.
--
-- PlatformAdmin, StripeEvent, and OrphanedSubscription are intentionally global
-- and retain allow_all. Every other table below is tenant-scoped.

DO $$
DECLARE
  tbl text;
  org_var text := $v$NULLIF(current_setting('app.org_id', true), '')::integer$v$;
  org_tables text[] := ARRAY[
    'ActivityLog', 'AttendanceExemption', 'Brother', 'BrotherMetricValue',
    'BrotherRole', 'Budget', 'CalendarEvent', 'CalendarEventType',
    'ChapterAnnouncement', 'ChatApproval', 'Doc', 'DocFolder', 'DuesPayment',
    'EventFieldDefinition', 'InstagramTask', 'JoinRequest', 'Membership',
    'OperationalEvent', 'OrgInvite', 'OrgMetricDefinition',
    'OrganizationConfig', 'PartyEvent', 'Poll', 'PollAssignment', 'PollOption',
    'PollVote', 'ProgrammingEvent', 'ProgrammingEventDoc', 'Reimbursement',
    'Role', 'SalesLead', 'Semester', 'ServiceEvent', 'ServiceParticipation',
    'Subscription', 'Task', 'TaskAssignment', 'Transaction',
    'TransactionCategory'
  ];
BEGIN
  FOREACH tbl IN ARRAY org_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', tbl);
    EXECUTE format(
      $sql$CREATE POLICY org_isolation ON %I
           USING ("organizationId" = %s)
           WITH CHECK ("organizationId" = %s)$sql$,
      tbl, org_var, org_var
    );
  END LOOP;
END $$;

-- Org-column-less join tables are scoped through an org-bound parent.
DO $$
DECLARE
  item record;
  org_var text := $v$NULLIF(current_setting('app.org_id', true), '')::integer$v$;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('AttendanceRecord',         'CalendarEvent', 'calendarEventId'),
      ('AttendanceExcuse',         'CalendarEvent', 'calendarEventId'),
      ('BudgetAllocation',         'Budget',        'budgetId'),
      ('InviteRedemption',         'OrgInvite',     'inviteId'),
      ('TransactionCalendarEvent', 'Transaction',   'transactionId')
    ) AS scoped(table_name, parent_name, fk_name)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', item.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', item.table_name);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', item.table_name);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', item.table_name);
    EXECUTE format(
      $sql$CREATE POLICY org_isolation ON %I
           USING (EXISTS (
             SELECT 1 FROM %I p
             WHERE p.id = %I.%I AND p."organizationId" = %s
           ))
           WITH CHECK (EXISTS (
             SELECT 1 FROM %I p
             WHERE p.id = %I.%I AND p."organizationId" = %s
           ))$sql$,
      item.table_name,
      item.parent_name, item.table_name, item.fk_name, org_var,
      item.parent_name, item.table_name, item.fk_name, org_var
    );
  END LOOP;
END $$;

-- Organization is the tenant root, so its primary key is the scope key.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "Organization";
DROP POLICY IF EXISTS org_isolation ON "Organization";
CREATE POLICY org_isolation ON "Organization"
  USING ("id" = NULLIF(current_setting('app.org_id', true), '')::integer);

-- Fail the migration atomically if a tenant table is missing its policy, still
-- has allow_all, or does not have RLS enabled and forced.
DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'ActivityLog', 'AttendanceExemption', 'Brother', 'BrotherMetricValue',
    'BrotherRole', 'Budget', 'CalendarEvent', 'CalendarEventType',
    'ChapterAnnouncement', 'ChatApproval', 'Doc', 'DocFolder', 'DuesPayment',
    'EventFieldDefinition', 'InstagramTask', 'JoinRequest', 'Membership',
    'OperationalEvent', 'OrgInvite', 'OrgMetricDefinition',
    'OrganizationConfig', 'PartyEvent', 'Poll', 'PollAssignment', 'PollOption',
    'PollVote', 'ProgrammingEvent', 'ProgrammingEventDoc', 'Reimbursement',
    'Role', 'SalesLead', 'Semester', 'ServiceEvent', 'ServiceParticipation',
    'Subscription', 'Task', 'TaskAssignment', 'Transaction',
    'TransactionCategory', 'AttendanceRecord', 'AttendanceExcuse',
    'BudgetAllocation', 'InviteRedemption', 'TransactionCalendarEvent',
    'Organization'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tbl
        AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled and forced on %', tbl;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND policyname = 'org_isolation'
    ) THEN
      RAISE EXCEPTION 'org_isolation policy is missing on %', tbl;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND policyname = 'allow_all'
    ) THEN
      RAISE EXCEPTION 'allow_all policy remains on tenant table %', tbl;
    END IF;
  END LOOP;
END $$;
