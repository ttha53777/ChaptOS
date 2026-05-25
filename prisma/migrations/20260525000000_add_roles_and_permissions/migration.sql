-- Discord-style roles & permissions.
-- Adds two tables and one back-relation. Idempotent guards on every statement
-- so re-running the file (or partial application) is safe.

-- ──────────────────────────────────────────────────────────────────────────
-- Role: a named permission bundle with a hierarchy rank.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Role" (
  "id"          SERIAL PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "color"       TEXT,
  "rank"        INTEGER NOT NULL DEFAULT 0,
  "permissions" INTEGER NOT NULL DEFAULT 0,
  "isSystem"    BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_key" ON "Role"("name");
CREATE INDEX IF NOT EXISTS "Role_rank_idx" ON "Role"("rank");

-- ──────────────────────────────────────────────────────────────────────────
-- BrotherRole: join table. A brother holds zero or more roles; effective
-- permissions are the bitwise OR of every assigned role's `permissions`.
-- Composite PK doubles as the uniqueness constraint, so re-granting the same
-- role to the same brother is a no-op (P2002 caught client-side).
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BrotherRole" (
  "brotherId"  INTEGER NOT NULL,
  "roleId"     INTEGER NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrotherRole_pkey" PRIMARY KEY ("brotherId", "roleId")
);

CREATE INDEX IF NOT EXISTS "BrotherRole_roleId_idx" ON "BrotherRole"("roleId");

-- Foreign keys with CASCADE so removing a brother or role cleans up their
-- assignments automatically. Wrapped in DO blocks so re-runs don't error.
DO $$ BEGIN
  ALTER TABLE "BrotherRole"
    ADD CONSTRAINT "BrotherRole_brotherId_fkey"
    FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BrotherRole"
    ADD CONSTRAINT "BrotherRole_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
