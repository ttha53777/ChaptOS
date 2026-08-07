-- Delete every roster row that was typed in by an officer rather than claimed by
-- a person: Brother rows with auth_user_id IS NULL.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- Officers used to be able to write someone onto the roster before that person
-- ever signed in. That one capability is the root of three separate defects:
--
--   * /api/auth/claim and /pending-access existed ONLY to let such a person
--     later match their own name and take the row over.
--   * OrgInvite.mode existed ONLY to point an invite at that name-match flow.
--   * redeem-invite had to 409 anyone who already owned an account but matched a
--     prepared row, because Brother.authUserId is globally unique and the merge
--     flow was never built (AGENTS.md still calls it "Still missing").
--
-- Invites now file a JoinRequest that an officer approves, which covers what
-- typing someone in was for. So the capability is removed, and with it the rows
-- it produced — none of which can ever be claimed now that the claim flow is
-- gone. Leaving them would leave every roster showing people who can never sign
-- in, against headcounts and dues totals that count them.
--
-- ── THIS IS IRREVERSIBLE ─────────────────────────────────────────────────────
-- Run `npx tsx scripts/preflight-accountless.ts` against the target database
-- FIRST and read the numbers. It prints exactly what this deletes, per org.
--
-- Measured on the shared dev DB at authoring time: 19 accountless Brothers
-- (qa-alpha 13, qa-beta 4, lpe 2, qa-fresh 1), dragging 78 AttendanceRecords,
-- 2 Transactions and 2 ServiceParticipations. Production may differ.
--
-- ── Cascade ──────────────────────────────────────────────────────────────────
-- A bare DELETE is correct and complete: it is exactly what
-- ctx.db.identity.deleteAccount does (lib/db/tenant.ts — a plain brother.delete),
-- and 20260801000000_member_erasure_fks already made every child FK either
-- CASCADE (Membership, AttendanceRecord, AttendanceExcuse, BrotherRole,
-- ServiceParticipation, BrotherMetricValue, InviteRedemption) or SET NULL
-- (Transaction.brotherId, OrgInvite.createdByBrotherId, ActivityLog.actorId).
-- No hand-ordered teardown needed.
--
-- PlatformAdmin.brotherId is the one FK still ON DELETE RESTRICT — deliberately,
-- so revoking platform staff is never a side effect of a roster tidy. An
-- accountless Brother holding a platform grant is nonsense data, but a migration
-- that ABORTS on it would be an outage, so those rows are excluded and reported
-- instead.

DO $$
DECLARE
  rec           RECORD;
  total_targets INTEGER;
  skipped       INTEGER;
  child_att     INTEGER;
  child_tx      INTEGER;
  child_svc     INTEGER;
BEGIN
  -- ── What is about to go, per org ───────────────────────────────────────────
  RAISE NOTICE '── accountless roster rows being deleted ──';
  FOR rec IN
    SELECT o.slug,
           count(*)                                    AS no_account,
           coalesce(sum(m."duesOwed"), 0)              AS their_dues
    FROM "Organization" o
    JOIN "Membership"   m ON m."organizationId" = o.id
    JOIN "Brother"      b ON b.id = m."brotherId"
    WHERE b."auth_user_id" IS NULL
    GROUP BY o.slug
    ORDER BY 2 DESC
  LOOP
    RAISE NOTICE '  % : % rows, $% of recorded dues', rec.slug, rec.no_account, rec.their_dues;
  END LOOP;

  SELECT count(*) INTO total_targets
    FROM "Brother" WHERE "auth_user_id" IS NULL;
  SELECT count(*) INTO skipped
    FROM "Brother" b
    JOIN "PlatformAdmin" pa ON pa."brotherId" = b.id
    WHERE b."auth_user_id" IS NULL;

  SELECT count(*) INTO child_att FROM "AttendanceRecord" a
    JOIN "Brother" b ON b.id = a."brotherId" WHERE b."auth_user_id" IS NULL;
  SELECT count(*) INTO child_tx FROM "Transaction" t
    JOIN "Brother" b ON b.id = t."brotherId" WHERE b."auth_user_id" IS NULL;
  SELECT count(*) INTO child_svc FROM "ServiceParticipation" s
    JOIN "Brother" b ON b.id = s."brotherId" WHERE b."auth_user_id" IS NULL;

  RAISE NOTICE 'totals: % accountless Brothers (% skipped for a platform-admin grant)',
    total_targets, skipped;
  RAISE NOTICE 'cascade: % attendance records, % ledger rows (SET NULL), % service participations',
    child_att, child_tx, child_svc;

  -- ── The delete ─────────────────────────────────────────────────────────────
  DELETE FROM "Brother" b
  WHERE b."auth_user_id" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "PlatformAdmin" pa WHERE pa."brotherId" = b.id);

  IF skipped > 0 THEN
    RAISE WARNING '% accountless Brother row(s) kept because they hold a PlatformAdmin grant. Resolve by hand.', skipped;
  END IF;
END $$;
