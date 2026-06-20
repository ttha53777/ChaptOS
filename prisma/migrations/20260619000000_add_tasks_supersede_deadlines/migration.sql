-- Tasks supersede Deadlines.
--
-- A Deadline was an org-wide item with a free-text `owner` and a conflated
-- 4-value status (Urgent/Due Soon/Upcoming/Complete) that mixed urgency with
-- completion. The product framing is "a deadline is just a task with a date",
-- so we unify into one Task model: optional dueDate, binary open/done status
-- (urgency is computed from dueDate at render time), and real assignment to
-- members and/or roles via TaskAssignment.
--
-- This migration: creates Task + TaskAssignment, copies existing Deadline rows
-- into Task (status mapped, owner folded into notes since it was never a real
-- FK), then drops Deadline.
--
-- Idempotent throughout. Carries the standard org-scoped-table boilerplate:
-- app-role CRUD + sequence grants + permissive allow_all RLS. Omitting the
-- sequence grant makes INSERT fail "permission denied for sequence"
-- (see 20260611000004_programming_app_grants).

-- ── Task table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Task" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "title"          TEXT NOT NULL,
  "dueDate"        TEXT,
  "status"         TEXT NOT NULL DEFAULT 'open',
  "notes"          TEXT,
  "createdById"    INTEGER,
  "completedById"  INTEGER,
  "completedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── TaskAssignment table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TaskAssignment" (
  "id"             SERIAL PRIMARY KEY,
  "taskId"         INTEGER NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "brotherId"      INTEGER,
  "roleId"         INTEGER
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_organizationId_fkey') THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT "Task_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAssignment_taskId_fkey') THEN
    ALTER TABLE "TaskAssignment"
      ADD CONSTRAINT "TaskAssignment_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAssignment_organizationId_fkey') THEN
    ALTER TABLE "TaskAssignment"
      ADD CONSTRAINT "TaskAssignment_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAssignment_brotherId_fkey') THEN
    ALTER TABLE "TaskAssignment"
      ADD CONSTRAINT "TaskAssignment_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAssignment_roleId_fkey') THEN
    ALTER TABLE "TaskAssignment"
      ADD CONSTRAINT "TaskAssignment_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ── CHECK constraints ─────────────────────────────────────────────────────────
-- Task.status: open | done (urgency is computed, never stored).
-- TaskAssignment: exactly one target (brother XOR role).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_status_check') THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT "Task_status_check"
      CHECK ("status" IN ('open','done'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAssignment_one_target_check') THEN
    ALTER TABLE "TaskAssignment"
      ADD CONSTRAINT "TaskAssignment_one_target_check"
      CHECK (("brotherId" IS NULL) <> ("roleId" IS NULL));
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Task_organizationId_idx"
  ON "Task" ("organizationId");
CREATE INDEX IF NOT EXISTS "Task_organizationId_status_idx"
  ON "Task" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "TaskAssignment_taskId_idx"
  ON "TaskAssignment" ("taskId");
CREATE INDEX IF NOT EXISTS "TaskAssignment_organizationId_brotherId_idx"
  ON "TaskAssignment" ("organizationId", "brotherId");
CREATE INDEX IF NOT EXISTS "TaskAssignment_organizationId_roleId_idx"
  ON "TaskAssignment" ("organizationId", "roleId");

-- ── Data migration: Deadline → Task ───────────────────────────────────────────
-- status: legacy 'Complete' → 'done', everything else → 'open'.
-- owner: legacy free-text label with no Brother FK — folded into notes (existing
--   deadlines were never truly assigned, so we do NOT fabricate assignments).
-- createdById: left NULL (legacy rows have no known creator).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Deadline') THEN
    INSERT INTO "Task" ("organizationId", "title", "dueDate", "status", "notes")
    SELECT
      "organizationId",
      "title",
      "dueDate",
      CASE WHEN "status" = 'Complete' THEN 'done' ELSE 'open' END,
      CASE WHEN "owner" IS NOT NULL AND "owner" <> '' THEN 'Owner: ' || "owner" ELSE NULL END
    FROM "Deadline";
  END IF;
END $$;

-- ── Drop the legacy Deadline table ────────────────────────────────────────────
DROP TABLE IF EXISTS "Deadline";

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Task" TO figurints_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "TaskAssignment" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "Task_id_seq" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "TaskAssignment_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all ───────────────────────────────────────
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "Task";
CREATE POLICY allow_all ON "Task" USING (true) WITH CHECK (true);

ALTER TABLE "TaskAssignment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "TaskAssignment";
CREATE POLICY allow_all ON "TaskAssignment" USING (true) WITH CHECK (true);

-- ── Backfill: enable the Tasks workflow for existing orgs ──────────────────────
-- Tasks is a brand-new workflow. Every org provisioned before this migration has
-- a config row whose enabledWorkflows predates "tasks", so the sidebar filter
-- (isNavVisible) hides the Tasks page for them. The org-type templates already
-- ship "tasks", so new orgs get it — this only catches up the existing rows.
-- Idempotent: only appends where the key is missing.
UPDATE "OrganizationConfig"
SET "enabledWorkflows" = array_append("enabledWorkflows", 'tasks')
WHERE NOT ('tasks' = ANY("enabledWorkflows"));
