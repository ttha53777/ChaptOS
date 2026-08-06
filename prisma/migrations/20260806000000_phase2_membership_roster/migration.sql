-- Phase 2: Membership becomes the roster row.
--
-- ── What this does ───────────────────────────────────────────────────────────
-- Moves the seven per-member roster values off Brother (one row per human,
-- pinned to a single "home" org) and onto Membership (one row per human PER
-- ORG). After this, one Google account can hold a real roster spot in several
-- organizations, each with its own role, GPA, dues balance, attendance,
-- service hours, archived state and custom field values.
--
--   role, attendance, duesOwed, gpa, serviceHours, archivedAt, customFields
--     Brother  ──────────────────────────────────────────────►  Membership
--
-- Brother keeps only identity: name (canonical fallback), email, avatarUrl,
-- authUserId, isGhost, isAdmin. Brother.organizationId survives as an
-- origin-org HINT — still required, still populated, but no roster / attendance
-- / dues / reporting read may scope by it again.
--
-- ── Ordering ─────────────────────────────────────────────────────────────────
--   1. Add the columns (all defaulted — no NULL window).
--   2. INSERT the missing home-org Memberships (roster-only members had none).
--   3. UPDATE the roster values onto the home-org Membership only.
--   4. Seed names / blank roles.
--   5. INVARIANT GATE — raises, which aborts the whole file, BEFORE step 6.
--   6. DROP the Brother columns.
--
-- Steps 2-then-3 (insert first, then one uniform update) so no reasoning is
-- needed about which rows the INSERT touched.
--
-- ── Grants / RLS ─────────────────────────────────────────────────────────────
-- Nothing to add, unusually for this repo. Membership already has its table
-- grants (20260530000001_figurints_app_role) and its org_isolation policy
-- (20260622000000_phase3_rls_policies); Membership_id_seq was covered by the
-- blanket GRANT USAGE ON ALL SEQUENCES; and ADD COLUMN does not alter table
-- privileges. No new table, no new sequence. The backfill runs as the table
-- owner via DIRECT_URL, and no table here has FORCE ROW LEVEL SECURITY, so RLS
-- does not filter it.
--
-- The one policy change below is AttendanceExcuse, which was scoped through
-- Brother.organizationId — an assumption this migration destroys. See §7.
--
-- ── For developers ───────────────────────────────────────────────────────────
-- `prisma db push` will DROP these columns without running the backfill and
-- silently zero every roster. Use `prisma migrate reset` (or `migrate dev`).

-- ============================================================
-- 1. Columns
-- ============================================================
ALTER TABLE "Membership"
  ADD COLUMN IF NOT EXISTS "role"         TEXT             NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "attendance"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "duesOwed"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "gpa"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "serviceHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "archivedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customFields" JSONB            NOT NULL DEFAULT '{}';

-- ============================================================
-- 2. Home-org Membership for every Brother that lacks one
-- ============================================================
-- Roster-only members (admin-typed, authUserId NULL) never had a Membership.
-- After this migration every roster row IS a Membership, so they need one.
--
-- isOrgAdmin stays false deliberately: Brother.isAdmin is the PLATFORM
-- superuser flag, not per-org admin authority. Org admin already lives on
-- Membership.isOrgAdmin and is not being re-derived here.
INSERT INTO "Membership" ("brotherId", "organizationId", "isOrgAdmin", "name", "joinedAt")
SELECT b."id", b."organizationId", false, b."name", NOW()
FROM "Brother" b
ON CONFLICT ("brotherId", "organizationId") DO NOTHING;

-- ============================================================
-- 3. Backfill the roster values onto the HOME-org membership
-- ============================================================
-- The organizationId equality in the join is what confines this to the home
-- org. A multi-org member's OTHER memberships are deliberately left at the
-- step-1 defaults: those orgs have never assessed them anything, so a blank
-- roster spot (0 dues, 0 GPA, 0% attendance, {} fields) is the correct and
-- honest starting state, not data loss.
UPDATE "Membership" m SET
  "role"         = b."role",
  "attendance"   = b."attendance",
  "duesOwed"     = b."duesOwed",
  "gpa"          = b."gpa",
  "serviceHours" = b."serviceHours",
  "archivedAt"   = b."archivedAt",
  "customFields" = b."customFields",
  "name"         = COALESCE(m."name", b."name")
FROM "Brother" b
WHERE m."brotherId" = b."id"
  AND m."organizationId" = b."organizationId";

-- ============================================================
-- 4. Seed names and blank roles
-- ============================================================
-- Membership.name stays nullable (see the schema comment — NOT NULL would 500
-- the claim bootstrap path), but backfilling it now means orderBy/where on the
-- name behaves for every existing row instead of clumping the fallbacks.
UPDATE "Membership" m SET "name" = b."name"
FROM "Brother" b
WHERE m."brotherId" = b."id" AND m."name" IS NULL;

-- Non-home memberships took the step-1 '' default. Give them the same label a
-- freshly-joined member gets, so nothing renders blank.
UPDATE "Membership" SET "role" = 'Member' WHERE "role" = '';

-- ============================================================
-- 5. INVARIANT GATE — the most important block in this file
-- ============================================================
-- Prisma runs each migration file inside one transaction, so a RAISE here
-- aborts before step 6 drops anything. A partial backfill therefore cannot
-- silently destroy a roster: either both halves are true or nothing happened.
DO $$
DECLARE
  orphans      bigint;
  brother_dues numeric;
  member_dues  numeric;
BEGIN
  -- Every Brother must now have a Membership in their home org.
  SELECT count(*) INTO orphans
  FROM "Brother" b
  LEFT JOIN "Membership" m
    ON m."brotherId" = b."id" AND m."organizationId" = b."organizationId"
  WHERE m."id" IS NULL;

  IF orphans > 0 THEN
    RAISE EXCEPTION 'phase2 abort: % brother(s) have no home-org membership', orphans;
  END IF;

  -- Not one cent may move. Compared over the home-org memberships only, which
  -- is exactly the set step 3 wrote.
  SELECT COALESCE(sum(b."duesOwed"), 0) INTO brother_dues FROM "Brother" b;

  SELECT COALESCE(sum(m."duesOwed"), 0) INTO member_dues
  FROM "Membership" m
  JOIN "Brother" b
    ON m."brotherId" = b."id" AND m."organizationId" = b."organizationId";

  IF brother_dues IS DISTINCT FROM member_dues THEN
    RAISE EXCEPTION 'phase2 abort: dues total drift, Brother=% Membership=%',
      brother_dues, member_dues;
  END IF;
END $$;

-- ============================================================
-- 6. Drop the Brother columns
-- ============================================================
-- Dropped in the SAME migration as the backfill, on purpose. The Prisma client
-- generates from schema.prisma, not from this file — so "drop in a follow-up"
-- would mean keeping the fields in the schema for a release, which means tsc
-- still sees them and stops flagging the call sites that must move. There is no
-- version of deferring this that preserves the compile-time guarantee.
ALTER TABLE "Brother"
  DROP COLUMN IF EXISTS "role",
  DROP COLUMN IF EXISTS "attendance",
  DROP COLUMN IF EXISTS "duesOwed",
  DROP COLUMN IF EXISTS "gpa",
  DROP COLUMN IF EXISTS "serviceHours",
  DROP COLUMN IF EXISTS "archivedAt",
  DROP COLUMN IF EXISTS "customFields";

-- ============================================================
-- 7. Re-point AttendanceExcuse's RLS policy at CalendarEvent
-- ============================================================
-- The Phase 3 policy scoped excuses by Brother.organizationId, with a comment
-- asserting it was "equivalent to calendarEvent scoping since an excuse's
-- brother and event are always in the same org". Phase 2 destroys that
-- assumption: a member homed in org A can now legitimately file an excuse for
-- an org B event, and the old policy would both hide it and reject the insert —
-- computing org B's attendance denominator without their excuses and reporting
-- their attendance too low.
--
-- Re-pointed at CalendarEvent, mirroring the AttendanceRecord policy exactly.
-- (Currently inert in this deployment: 20260622000002_phase4_revert_allow_all
-- restored allow_all on this table, which Postgres ORs with org_isolation. Fixed
-- anyway so the policy is correct whenever enforcement is turned back on — the
-- matching delegate filter in lib/db/tenant.ts is the live one.)
DROP POLICY IF EXISTS org_isolation ON "AttendanceExcuse";
CREATE POLICY org_isolation ON "AttendanceExcuse"
  USING (EXISTS (
    SELECT 1 FROM "CalendarEvent" p
    WHERE p."id" = "AttendanceExcuse"."calendarEventId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "CalendarEvent" p
    WHERE p."id" = "AttendanceExcuse"."calendarEventId"
      AND p."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ));
