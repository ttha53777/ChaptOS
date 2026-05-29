-- Phase 2.5: OperationalEvent — structured event log.
-- The raw fact-stream Phase 3 workflows / notifications / analytics project from.

CREATE TABLE IF NOT EXISTS "OperationalEvent" (
    "id"             BIGSERIAL PRIMARY KEY,
    "organizationId" INTEGER NOT NULL,
    "requestId"      TEXT    NOT NULL,
    "actorId"        INTEGER,
    "action"         TEXT    NOT NULL,
    "subjectType"    TEXT    NOT NULL,
    "subjectId"      INTEGER NOT NULL,
    "metadata"       JSONB   NOT NULL DEFAULT '{}'::jsonb,
    "occurredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OperationalEvent_organizationId_fkey') THEN
    ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OperationalEvent_organizationId_occurredAt_idx"
  ON "OperationalEvent"("organizationId", "occurredAt");

CREATE INDEX IF NOT EXISTS "OperationalEvent_organizationId_action_occurredAt_idx"
  ON "OperationalEvent"("organizationId", "action", "occurredAt");

CREATE INDEX IF NOT EXISTS "OperationalEvent_subjectType_subjectId_idx"
  ON "OperationalEvent"("subjectType", "subjectId");

CREATE INDEX IF NOT EXISTS "OperationalEvent_requestId_idx"
  ON "OperationalEvent"("requestId");

-- RLS posture: enable + permissive policy now (matches phase 1 RLS rollout).
-- Enforcing policy flips during phase 2.5 step 10 along with all other tables.
ALTER TABLE "OperationalEvent" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'OperationalEvent' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON "OperationalEvent" USING (true);
  END IF;
END $$;
