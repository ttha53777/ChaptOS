-- Phase 1 RLS: Enable Row Level Security on all domain tables.
-- Policies are PERMISSIVE (USING (true)) initially so existing traffic is
-- unaffected. Flip to org-scoped enforcement in Phase 2 once the Prisma
-- middleware is wired to SET app.org_id before each query.

-- ============================================================
-- Enable RLS (idempotent — repeated ENABLE is a no-op in PG)
-- ============================================================

ALTER TABLE "Brother"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Semester"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deadline"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstagramTask"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Doc"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartyEvent"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarEvent"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceEvent"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLog"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Budget"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChapterAnnouncement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAdmin"       ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Permissive allow-all policies (Phase 1 placeholder)
-- These will be replaced with org-scoped policies in Phase 2.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Brother' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "Brother" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Role' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "Role" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Semester' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "Semester" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Deadline' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "Deadline" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'InstagramTask' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "InstagramTask" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Doc' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "Doc" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'PartyEvent' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "PartyEvent" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'CalendarEvent' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "CalendarEvent" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ServiceEvent' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "ServiceEvent" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ActivityLog' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "ActivityLog" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Transaction' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "Transaction" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Budget' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "Budget" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ChapterAnnouncement' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "ChapterAnnouncement" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Membership' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "Membership" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'Organization' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "Organization" USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'PlatformAdmin' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "PlatformAdmin" USING (true);
  END IF;
END $$;
