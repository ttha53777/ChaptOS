-- Per-semester attendance exemptions.
--
-- A member marked exempt for a semester (abroad / co-op / inactive / other) is
-- removed from every mandatory event's eligible set for that semester — no more
-- filing an excuse per event — and is excluded from the chapter-wide attendance
-- ratio (the recalc parks their Brother.attendance at the -1 "exempt" sentinel).
--
-- Org-scoped like Poll: carries organizationId directly, so tenancy is a plain
-- WHERE rather than a relation join. Lives inside the roster / attendance surface
-- (no new sidebar page / workflow id), so there is NO enabledWorkflows backfill.
--
-- Idempotent throughout. Carries the standard org-scoped-table boilerplate:
-- app-role CRUD + sequence grant + permissive allow_all RLS. Omitting the
-- sequence grant makes INSERT fail "permission denied for sequence"
-- (see 20260611000004_programming_app_grants).

-- ── AttendanceExemption table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AttendanceExemption" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "brotherId"      INTEGER NOT NULL,
  "semesterId"     INTEGER NOT NULL,
  "reason"         TEXT NOT NULL DEFAULT 'inactive',
  "note"           TEXT,
  "createdById"    INTEGER,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceExemption_organizationId_fkey') THEN
    ALTER TABLE "AttendanceExemption"
      ADD CONSTRAINT "AttendanceExemption_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceExemption_brotherId_fkey') THEN
    ALTER TABLE "AttendanceExemption"
      ADD CONSTRAINT "AttendanceExemption_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceExemption_semesterId_fkey') THEN
    ALTER TABLE "AttendanceExemption"
      ADD CONSTRAINT "AttendanceExemption_semesterId_fkey"
      FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ── CHECK constraint ──────────────────────────────────────────────────────────
-- reason: abroad | coop | inactive | other (ExemptionReason union in @/lib/state).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceExemption_reason_check') THEN
    ALTER TABLE "AttendanceExemption"
      ADD CONSTRAINT "AttendanceExemption_reason_check"
      CHECK ("reason" IN ('abroad','coop','inactive','other'));
  END IF;
END $$;

-- ── Unique: one exemption per member per semester (re-marking = upsert) ────────
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceExemption_semesterId_brotherId_key"
  ON "AttendanceExemption" ("semesterId", "brotherId");

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "AttendanceExemption_organizationId_semesterId_idx"
  ON "AttendanceExemption" ("organizationId", "semesterId");

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AttendanceExemption" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "AttendanceExemption_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all ───────────────────────────────────────
ALTER TABLE "AttendanceExemption" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "AttendanceExemption";
CREATE POLICY allow_all ON "AttendanceExemption" USING (true) WITH CHECK (true);
