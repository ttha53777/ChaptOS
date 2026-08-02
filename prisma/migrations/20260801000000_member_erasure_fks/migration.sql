-- Make member deletion actually possible.
--
-- `deleteBrother()` is a single `DELETE FROM "Brother"`, and three foreign keys
-- were ON DELETE RESTRICT, so it failed for anyone with any history at all. On
-- the dev database that was 26 of 34 members (76%) — the roster's remove button
-- returned an opaque 409 "Foreign key constraint" for three quarters of the
-- people an admin might want to remove, and member-level erasure (the deletion
-- path /trust promises) was impossible.
--
-- The fix belongs at the DB layer rather than in the service: `ctx.db` has no
-- transaction primitive (see the note in doc-folder-service.ts), so clearing
-- children from application code would mean several independent transactions —
-- a mid-way failure would leave a member whose attendance had been wiped but who
-- still exists. A referential action is one statement and atomic by construction.
--
-- Which action each FK gets follows the split this schema already uses for the
-- twelve other Brother references:
--
--   CASCADE  — rows that are *about* the person and have no meaning without them.
--              Already how DuesPayment, Reimbursement, PollVote,
--              ServiceParticipation, BrotherMetricValue and AttendanceExemption
--              behave. Attendance records and excuses are the same kind of thing.
--
--   SET NULL — records the person *acted on* that outlive them. Already how
--              ActivityLog.actorId and Transaction.brotherId behave: the money
--              and the audit trail survive with an anonymous actor. An invite
--              link is org property — revoking every outstanding link because
--              the officer who created it left would be a bug, not cleanup.
--
-- PlatformAdmin.brotherId stays RESTRICT on purpose. Deleting a platform admin's
-- Brother row out from under the platform-admin grant should not be a silent
-- side effect of a roster action; deleteBrother() now checks for it up front and
-- raises a ConflictError naming the reason.
--
-- Idempotent: each constraint is dropped IF EXISTS before being recreated.

-- ── AttendanceRecord.brotherId: RESTRICT → CASCADE ───────────────────────────
ALTER TABLE "AttendanceRecord" DROP CONSTRAINT IF EXISTS "AttendanceRecord_brotherId_fkey";
ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_brotherId_fkey"
  FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── AttendanceExcuse.brotherId: RESTRICT → CASCADE ───────────────────────────
ALTER TABLE "AttendanceExcuse" DROP CONSTRAINT IF EXISTS "AttendanceExcuse_brotherId_fkey";
ALTER TABLE "AttendanceExcuse"
  ADD CONSTRAINT "AttendanceExcuse_brotherId_fkey"
  FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── OrgInvite.createdByBrotherId: NOT NULL RESTRICT → NULLABLE SET NULL ──────
-- Widening to nullable is backwards-compatible: every existing row keeps its
-- creator, and the column only becomes NULL when that Brother is deleted.
ALTER TABLE "OrgInvite" ALTER COLUMN "createdByBrotherId" DROP NOT NULL;
ALTER TABLE "OrgInvite" DROP CONSTRAINT IF EXISTS "OrgInvite_createdByBrotherId_fkey";
ALTER TABLE "OrgInvite"
  ADD CONSTRAINT "OrgInvite_createdByBrotherId_fkey"
  FOREIGN KEY ("createdByBrotherId") REFERENCES "Brother"("id") ON DELETE SET NULL ON UPDATE CASCADE;
