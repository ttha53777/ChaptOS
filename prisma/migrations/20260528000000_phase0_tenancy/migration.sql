-- Phase 0: Introduce tenancy boundary.
-- Idempotent: uses IF NOT EXISTS / IF EXISTS throughout so a partial prior
-- apply (tables/columns/FKs already exist) is handled safely.

-- ============================================================
-- 1. New tables (idempotent)
-- ============================================================

CREATE TABLE IF NOT EXISTS "Organization" (
    "id"        SERIAL PRIMARY KEY,
    "name"      TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_slug_key" UNIQUE ("slug")
);

CREATE TABLE IF NOT EXISTS "Membership" (
    "id"             SERIAL PRIMARY KEY,
    "brotherId"      INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "isOrgAdmin"     BOOLEAN NOT NULL DEFAULT false,
    "joinedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_brotherId_organizationId_key" UNIQUE ("brotherId", "organizationId")
);

CREATE TABLE IF NOT EXISTS "PlatformAdmin" (
    "id"        SERIAL PRIMARY KEY,
    "brotherId" INTEGER NOT NULL,
    CONSTRAINT "PlatformAdmin_brotherId_key" UNIQUE ("brotherId")
);

-- ============================================================
-- 2. Seed the single existing organization (idempotent)
-- ============================================================

INSERT INTO "Organization" ("id", "name", "slug", "createdAt")
VALUES (1, 'Lambda Phi Epsilon', 'lpe', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ============================================================
-- 3. Add nullable organizationId columns (idempotent)
-- ============================================================

ALTER TABLE "Brother"             ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "Role"                ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "Semester"            ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "Deadline"            ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "InstagramTask"       ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "Doc"                 ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "PartyEvent"          ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "CalendarEvent"       ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "ServiceEvent"        ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "ActivityLog"         ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "Transaction"         ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "Budget"              ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
ALTER TABLE "ChapterAnnouncement" ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;

-- ============================================================
-- 4. Backfill all existing rows to org 1
-- ============================================================

UPDATE "Brother"             SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "Role"                SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "Semester"            SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "Deadline"            SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "InstagramTask"       SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "Doc"                 SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "PartyEvent"          SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "CalendarEvent"       SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "ServiceEvent"        SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "ActivityLog"         SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "Transaction"         SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "Budget"              SET "organizationId" = 1 WHERE "organizationId" IS NULL;
UPDATE "ChapterAnnouncement" SET "organizationId" = 1 WHERE "organizationId" IS NULL;

-- ============================================================
-- 5. Seed Membership rows (idempotent via ON CONFLICT)
-- ============================================================

INSERT INTO "Membership" ("brotherId", "organizationId", "isOrgAdmin", "joinedAt")
SELECT "id", 1, "isAdmin", CURRENT_TIMESTAMP
FROM "Brother"
ON CONFLICT ("brotherId", "organizationId") DO NOTHING;

-- ============================================================
-- 6. Seed PlatformAdmin from existing super-admins (idempotent)
-- ============================================================

INSERT INTO "PlatformAdmin" ("brotherId")
SELECT "id" FROM "Brother" WHERE "isAdmin" = true
ON CONFLICT ("brotherId") DO NOTHING;

-- ============================================================
-- 7. Promote columns to NOT NULL
-- ============================================================

ALTER TABLE "Brother"             ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Role"                ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Semester"            ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Deadline"            ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "InstagramTask"       ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Doc"                 ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "PartyEvent"          ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CalendarEvent"       ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ServiceEvent"        ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ActivityLog"         ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Transaction"         ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Budget"              ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ChapterAnnouncement" ALTER COLUMN "organizationId" SET NOT NULL;

-- ============================================================
-- 8. Add FK constraints (idempotent via DO $$ blocks)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_brotherId_fkey') THEN
    ALTER TABLE "Membership" ADD CONSTRAINT "Membership_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_organizationId_fkey') THEN
    ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlatformAdmin_brotherId_fkey') THEN
    ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_brotherId_fkey"
      FOREIGN KEY ("brotherId") REFERENCES "Brother"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Brother_organizationId_fkey') THEN
    ALTER TABLE "Brother" ADD CONSTRAINT "Brother_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Role_organizationId_fkey') THEN
    ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Semester_organizationId_fkey') THEN
    ALTER TABLE "Semester" ADD CONSTRAINT "Semester_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deadline_organizationId_fkey') THEN
    ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InstagramTask_organizationId_fkey') THEN
    ALTER TABLE "InstagramTask" ADD CONSTRAINT "InstagramTask_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Doc_organizationId_fkey') THEN
    ALTER TABLE "Doc" ADD CONSTRAINT "Doc_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartyEvent_organizationId_fkey') THEN
    ALTER TABLE "PartyEvent" ADD CONSTRAINT "PartyEvent_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarEvent_organizationId_fkey') THEN
    ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceEvent_organizationId_fkey') THEN
    ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActivityLog_organizationId_fkey') THEN
    ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_organizationId_fkey') THEN
    ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Budget_organizationId_fkey') THEN
    ALTER TABLE "Budget" ADD CONSTRAINT "Budget_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChapterAnnouncement_organizationId_fkey') THEN
    ALTER TABLE "ChapterAnnouncement" ADD CONSTRAINT "ChapterAnnouncement_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

-- ============================================================
-- 9. Fix unique indexes to be per-org
-- (old indexes used CREATE UNIQUE INDEX, not ADD CONSTRAINT — drop by index name)
-- ============================================================

DROP INDEX IF EXISTS "Role_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Role_organizationId_name_key" ON "Role"("organizationId", "name");

DROP INDEX IF EXISTS "Semester_label_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Semester_organizationId_label_key" ON "Semester"("organizationId", "label");

DROP INDEX IF EXISTS "Budget_semester_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Budget_organizationId_semester_key" ON "Budget"("organizationId", "semester");

-- Fix ChapterAnnouncement id sequence (was defaulted to 1; now autoincrement)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ChapterAnnouncement_id_seq') THEN
    CREATE SEQUENCE "ChapterAnnouncement_id_seq";
    ALTER TABLE "ChapterAnnouncement"
      ALTER COLUMN "id" SET DEFAULT nextval('"ChapterAnnouncement_id_seq"');
    PERFORM setval('"ChapterAnnouncement_id_seq"',
      COALESCE((SELECT MAX("id") FROM "ChapterAnnouncement"), 0) + 1, false);
  END IF;
END $$;

-- ============================================================
-- 10. New indexes (idempotent)
-- ============================================================

CREATE INDEX IF NOT EXISTS "Membership_organizationId_idx"          ON "Membership"("organizationId");
CREATE INDEX IF NOT EXISTS "Brother_organizationId_idx"             ON "Brother"("organizationId");
CREATE INDEX IF NOT EXISTS "Role_organizationId_rank_idx"           ON "Role"("organizationId", "rank");
CREATE INDEX IF NOT EXISTS "Semester_organizationId_isActive_idx"   ON "Semester"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "Deadline_organizationId_idx"            ON "Deadline"("organizationId");
CREATE INDEX IF NOT EXISTS "InstagramTask_organizationId_idx"       ON "InstagramTask"("organizationId");
CREATE INDEX IF NOT EXISTS "Doc_organizationId_createdAt_idx"       ON "Doc"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "PartyEvent_organizationId_idx"          ON "PartyEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "CalendarEvent_organizationId_idx"       ON "CalendarEvent"("organizationId", "category", "date");
CREATE INDEX IF NOT EXISTS "ServiceEvent_organizationId_idx"        ON "ServiceEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "ActivityLog_organizationId_idx"         ON "ActivityLog"("organizationId", "timestamp");
CREATE INDEX IF NOT EXISTS "Transaction_organizationId_idx"         ON "Transaction"("organizationId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Budget_organizationId_idx"              ON "Budget"("organizationId");
CREATE INDEX IF NOT EXISTS "ChapterAnnouncement_organizationId_idx" ON "ChapterAnnouncement"("organizationId");
