-- Polls.
--
-- A poll is task-shaped: attach members and/or roles plus an optional date,
-- exactly like a Task. It adds a question with 2-10 options that attached
-- members vote on (single-choice: one vote per voter, changeable). Results are
-- live; closing a poll locks voting but keeps results visible. Status is
-- open/closed (PollStatus union in @/lib/state).
--
-- Polls live INSIDE the Tasks page (no new sidebar surface / workflow id), so
-- unlike the tasks migration there is NO enabledWorkflows backfill.
--
-- Idempotent throughout. Carries the standard org-scoped-table boilerplate:
-- app-role CRUD + sequence grants + permissive allow_all RLS. Omitting the
-- sequence grant makes INSERT fail "permission denied for sequence"
-- (see 20260611000004_programming_app_grants).

-- ── Poll table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Poll" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "title"          TEXT NOT NULL,
  "question"       TEXT NOT NULL,
  "closeDate"      TEXT,
  "status"         TEXT NOT NULL DEFAULT 'open',
  "createdById"    INTEGER,
  "closedById"     INTEGER,
  "closedAt"       TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── PollOption table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PollOption" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "pollId"         INTEGER NOT NULL,
  "label"          TEXT NOT NULL,
  "position"       INTEGER NOT NULL DEFAULT 0
);

-- ── PollAssignment table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PollAssignment" (
  "id"             SERIAL PRIMARY KEY,
  "pollId"         INTEGER NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "brotherId"      INTEGER,
  "roleId"         INTEGER
);

-- ── PollVote table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PollVote" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "pollId"         INTEGER NOT NULL,
  "optionId"       INTEGER NOT NULL,
  "brotherId"      INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Poll_organizationId_fkey') THEN
    ALTER TABLE "Poll"
      ADD CONSTRAINT "Poll_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollOption_pollId_fkey') THEN
    ALTER TABLE "PollOption"
      ADD CONSTRAINT "PollOption_pollId_fkey"
      FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollOption_organizationId_fkey') THEN
    ALTER TABLE "PollOption"
      ADD CONSTRAINT "PollOption_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollAssignment_pollId_fkey') THEN
    ALTER TABLE "PollAssignment"
      ADD CONSTRAINT "PollAssignment_pollId_fkey"
      FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollAssignment_organizationId_fkey') THEN
    ALTER TABLE "PollAssignment"
      ADD CONSTRAINT "PollAssignment_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollAssignment_brotherId_fkey') THEN
    ALTER TABLE "PollAssignment"
      ADD CONSTRAINT "PollAssignment_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollAssignment_roleId_fkey') THEN
    ALTER TABLE "PollAssignment"
      ADD CONSTRAINT "PollAssignment_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollVote_pollId_fkey') THEN
    ALTER TABLE "PollVote"
      ADD CONSTRAINT "PollVote_pollId_fkey"
      FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollVote_optionId_fkey') THEN
    ALTER TABLE "PollVote"
      ADD CONSTRAINT "PollVote_optionId_fkey"
      FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollVote_brotherId_fkey') THEN
    ALTER TABLE "PollVote"
      ADD CONSTRAINT "PollVote_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollVote_organizationId_fkey') THEN
    ALTER TABLE "PollVote"
      ADD CONSTRAINT "PollVote_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ── CHECK constraints ─────────────────────────────────────────────────────────
-- Poll.status: open | closed (results live; closing locks voting).
-- PollAssignment: exactly one target (brother XOR role).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Poll_status_check') THEN
    ALTER TABLE "Poll"
      ADD CONSTRAINT "Poll_status_check"
      CHECK ("status" IN ('open','closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollAssignment_one_target_check') THEN
    ALTER TABLE "PollAssignment"
      ADD CONSTRAINT "PollAssignment_one_target_check"
      CHECK (("brotherId" IS NULL) <> ("roleId" IS NULL));
  END IF;
END $$;

-- ── Unique: one vote per voter per poll (single-choice; re-vote = upsert) ──────
CREATE UNIQUE INDEX IF NOT EXISTS "PollVote_pollId_brotherId_key"
  ON "PollVote" ("pollId", "brotherId");

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Poll_organizationId_idx"
  ON "Poll" ("organizationId");
CREATE INDEX IF NOT EXISTS "Poll_organizationId_status_idx"
  ON "Poll" ("organizationId", "status");

CREATE INDEX IF NOT EXISTS "PollOption_pollId_idx"
  ON "PollOption" ("pollId");
CREATE INDEX IF NOT EXISTS "PollOption_organizationId_idx"
  ON "PollOption" ("organizationId");

CREATE INDEX IF NOT EXISTS "PollAssignment_pollId_idx"
  ON "PollAssignment" ("pollId");
CREATE INDEX IF NOT EXISTS "PollAssignment_organizationId_brotherId_idx"
  ON "PollAssignment" ("organizationId", "brotherId");
CREATE INDEX IF NOT EXISTS "PollAssignment_organizationId_roleId_idx"
  ON "PollAssignment" ("organizationId", "roleId");

CREATE INDEX IF NOT EXISTS "PollVote_pollId_idx"
  ON "PollVote" ("pollId");
CREATE INDEX IF NOT EXISTS "PollVote_optionId_idx"
  ON "PollVote" ("optionId");

-- ── App-role GRANTs ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Poll" TO figurints_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PollOption" TO figurints_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PollAssignment" TO figurints_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PollVote" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "Poll_id_seq" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "PollOption_id_seq" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "PollAssignment_id_seq" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "PollVote_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all ───────────────────────────────────────
ALTER TABLE "Poll" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "Poll";
CREATE POLICY allow_all ON "Poll" USING (true) WITH CHECK (true);

ALTER TABLE "PollOption" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "PollOption";
CREATE POLICY allow_all ON "PollOption" USING (true) WITH CHECK (true);

ALTER TABLE "PollAssignment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "PollAssignment";
CREATE POLICY allow_all ON "PollAssignment" USING (true) WITH CHECK (true);

ALTER TABLE "PollVote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "PollVote";
CREATE POLICY allow_all ON "PollVote" USING (true) WITH CHECK (true);
