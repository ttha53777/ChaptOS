-- ServiceParticipation: one row per (member, service event) recording the hours
-- that member earned at that event. Source of truth for Brother.serviceHours,
-- which the recalc-service-hours event handler recomputes as SUM(hours) — the
-- same aggregate-from-records pattern AttendanceRecord uses for attendance.
--
-- Idempotent (IF NOT EXISTS / IF EXISTS throughout) so a partial prior apply or
-- a hand-apply via the Supabase SQL editor is safe to re-run.
--
-- Carries the full org-scoped-table boilerplate every other domain table has:
-- app-role CRUD grants + sequence USAGE/SELECT (or INSERT fails "permission
-- denied for sequence") + permissive allow_all RLS (defense-in-depth; real
-- tenant isolation stays at the app layer in lib/db/tenant.ts). See
-- 20260611000004_programming_app_grants for the cautionary tale of omitting it.

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ServiceParticipation" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "serviceEventId" INTEGER NOT NULL,
  "brotherId"      INTEGER NOT NULL,
  "hours"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Constraints + indexes ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceParticipation_serviceEventId_fkey') THEN
    ALTER TABLE "ServiceParticipation"
      ADD CONSTRAINT "ServiceParticipation_serviceEventId_fkey"
      FOREIGN KEY ("serviceEventId") REFERENCES "ServiceEvent"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceParticipation_brotherId_fkey') THEN
    ALTER TABLE "ServiceParticipation"
      ADD CONSTRAINT "ServiceParticipation_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceParticipation_organizationId_fkey') THEN
    ALTER TABLE "ServiceParticipation"
      ADD CONSTRAINT "ServiceParticipation_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceParticipation_serviceEventId_brotherId_key"
  ON "ServiceParticipation"("serviceEventId", "brotherId");
CREATE INDEX IF NOT EXISTS "ServiceParticipation_organizationId_idx"
  ON "ServiceParticipation"("organizationId");
CREATE INDEX IF NOT EXISTS "ServiceParticipation_brotherId_idx"
  ON "ServiceParticipation"("brotherId");

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- Existing Brother.serviceHours values are real and must survive the switch to a
-- derived aggregate. Synthesize one service event per org ("Logged before The
-- Service Log") and one participation row per member with serviceHours > 0, so
-- the recompute (SUM of participations) reproduces today's totals exactly —
-- zero data loss, math stays purely derived.
--
-- The synthetic event uses a deterministic title so the insert is idempotent
-- (re-running won't create duplicates). Only orgs that actually have members
-- with hours get a backfill event.
DO $$
DECLARE
  org RECORD;
  evt_id INTEGER;
BEGIN
  FOR org IN
    SELECT DISTINCT "organizationId" AS id
    FROM "Brother"
    WHERE "serviceHours" > 0 AND "isGhost" = false
  LOOP
    -- Find or create the per-org synthetic event.
    SELECT "id" INTO evt_id
    FROM "ServiceEvent"
    WHERE "organizationId" = org.id AND "title" = 'Logged before The Service Log'
    LIMIT 1;

    IF evt_id IS NULL THEN
      INSERT INTO "ServiceEvent" ("organizationId", "title", "date", "location", "notes")
      VALUES (org.id, 'Logged before The Service Log', to_char(CURRENT_DATE, 'YYYY-MM-DD'), '',
              'Auto-created during the Service Log migration to preserve hours logged before per-event tracking.')
      RETURNING "id" INTO evt_id;
    END IF;

    -- One participation row per member with prior hours (skip if already present).
    -- updatedAt is set explicitly: Prisma's @updatedAt is a client-side default,
    -- so raw SQL must populate it (the column is NOT NULL with no DB default when
    -- the table was created via `prisma db push`).
    INSERT INTO "ServiceParticipation" ("organizationId", "serviceEventId", "brotherId", "hours", "createdAt", "updatedAt")
    SELECT b."organizationId", evt_id, b."id", b."serviceHours", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "Brother" b
    WHERE b."organizationId" = org.id AND b."serviceHours" > 0 AND b."isGhost" = false
    ON CONFLICT ("serviceEventId", "brotherId") DO NOTHING;
  END LOOP;
END $$;

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ServiceParticipation" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "ServiceParticipation_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all ───────────────────────────────────────
ALTER TABLE "ServiceParticipation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "ServiceParticipation";
CREATE POLICY allow_all ON "ServiceParticipation" USING (true) WITH CHECK (true);
