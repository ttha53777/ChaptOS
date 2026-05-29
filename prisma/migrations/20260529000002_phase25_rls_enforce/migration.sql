-- Phase 2.5: flip RLS policies from permissive (USING true) to enforcing
-- (USING organizationId = current_setting('app.org_id')::int).
--
-- Effect by role:
--   - The DB role that owns the table (postgres on Supabase) has BYPASSRLS
--     and is unaffected. This is the role Prisma currently connects as,
--     so production behavior does not change until you provision a
--     non-BYPASSRLS app role.
--   - Any role WITHOUT BYPASSRLS — test DB, future "figurints_app" role —
--     will be filtered by org. db().$transaction() sets app.org_id via
--     SET LOCAL; queries inside the transaction become org-scoped.
--
-- To revert: replace USING expressions with `true`, or DROP POLICY and
-- recreate with USING (true). One migration.
--
-- We use `current_setting('app.org_id', true)` (the `true` second arg) so
-- queries from sessions that haven't SET the var don't error; they just see
-- zero rows. This avoids breaking diagnostic queries / non-app callers.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'Brother','Role','Semester','Deadline','InstagramTask','Doc',
    'PartyEvent','CalendarEvent','ServiceEvent','ActivityLog',
    'Transaction','Budget','ChapterAnnouncement','Membership',
    'OperationalEvent'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (
         "organizationId" = NULLIF(current_setting(''app.org_id'', true), '''')::integer
       )',
      tbl
    );
  END LOOP;
END $$;

-- Organization itself is keyed by id (not organizationId) — scope by id matching.
DROP POLICY IF EXISTS allow_all ON "Organization";
CREATE POLICY org_isolation ON "Organization" USING (
  "id" = NULLIF(current_setting('app.org_id', true), '')::integer
);

-- PlatformAdmin is a global-scope table (no org column). Keep permissive —
-- accessed only by trusted code paths during auth checks.
-- (Policy already exists as allow_all from the prior migration; leave it.)
