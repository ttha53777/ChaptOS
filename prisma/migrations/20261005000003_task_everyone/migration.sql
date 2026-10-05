-- "Everyone" becomes a live target on Task instead of a snapshot of the roster,
-- with a choice of who finishes it: one person for the chapter ('any') or every
-- member ('each', tracked per member in TaskCompletion). Additive only.
ALTER TABLE "Task" ADD COLUMN "everyone" TEXT;
ALTER TABLE "Task" ADD CONSTRAINT task_everyone_mode CHECK ("everyone" IS NULL OR "everyone" IN ('any', 'each'));

CREATE TABLE "TaskCompletion" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "brotherId" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskCompletion_taskId_brotherId_key" ON "TaskCompletion"("taskId", "brotherId");
CREATE INDEX "TaskCompletion_organizationId_brotherId_idx" ON "TaskCompletion"("organizationId", "brotherId");

ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_brotherId_fkey" FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No permissive policy: every new tenant table is isolated from day one.
ALTER TABLE "TaskCompletion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "TaskCompletion" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "TaskCompletion" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "TaskCompletion_id_seq" TO figurints_app;
  END IF;
END $$;
