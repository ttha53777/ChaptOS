-- Push notifications (app plan Phase 5): devices, per-member preferences, and
-- the outbox the sender drains.
--
-- Additive: three new tables, nothing existing is touched.
--
-- Access:
--   PushDevice             GLOBAL (keyed by the Google account, not an org).
--                          RLS on with NO policy, the TermsAcceptance posture:
--                          figurints_app gets nothing, and every read and write
--                          goes through prismaPrivileged in lib/push/devices.ts.
--   NotificationPreference org-scoped, org_isolation only, from day one.
--   PushMessage            org-scoped, org_isolation only. Handlers enqueue
--                          through ctx.db; the sender (a trusted worker that must
--                          also read PushDevice) drains it as prismaPrivileged.
--
-- Organization/Brother/Membership FKs CASCADE, so deleting an org, a member's
-- roster row, or a whole identity takes these rows with it.
--
-- Rollback: DROP TABLE "PushMessage", "NotificationPreference", "PushDevice";


-- CreateTable
CREATE TABLE "PushDevice" (
    "id" SERIAL NOT NULL,
    "authUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "brotherId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushMessage" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "brotherId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ticketIds" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "receiptsCheckedAt" TIMESTAMP(3),
    CONSTRAINT "PushMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");

-- CreateIndex
CREATE INDEX "PushDevice_authUserId_idx" ON "PushDevice"("authUserId");

-- CreateIndex
CREATE INDEX "NotificationPreference_brotherId_idx" ON "NotificationPreference"("brotherId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_organizationId_brotherId_category_key" ON "NotificationPreference"("organizationId", "brotherId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "PushMessage_dedupeKey_key" ON "PushMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "PushMessage_status_createdAt_idx" ON "PushMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PushMessage_organizationId_brotherId_category_createdAt_idx" ON "PushMessage"("organizationId", "brotherId", "category", "createdAt");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_brotherId_fkey" FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_brotherId_organizationId_fkey" FOREIGN KEY ("brotherId", "organizationId") REFERENCES "Membership"("brotherId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushMessage" ADD CONSTRAINT "PushMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushMessage" ADD CONSTRAINT "PushMessage_brotherId_fkey" FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- State columns (lib/state/push.ts).
ALTER TABLE "PushDevice" ADD CONSTRAINT push_device_platform CHECK ("platform" IN ('ios', 'android'));
ALTER TABLE "NotificationPreference" ADD CONSTRAINT notification_preference_category
  CHECK ("category" IN ('checkin', 'tasks', 'dues', 'attendance', 'requests'));
ALTER TABLE "PushMessage" ADD CONSTRAINT push_message_category
  CHECK ("category" IN ('checkin', 'tasks', 'dues', 'attendance', 'requests', 'membership'));
ALTER TABLE "PushMessage" ADD CONSTRAINT push_message_status
  CHECK ("status" IN ('pending', 'sent', 'failed', 'dropped'));

-- PushDevice: no policy, no app-role grant.
ALTER TABLE "PushDevice" ENABLE ROW LEVEL SECURITY;

-- Org-scoped tables: isolated from day one.
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "NotificationPreference" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);
ALTER TABLE "PushMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "PushMessage" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "NotificationPreference" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "NotificationPreference_id_seq" TO figurints_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PushMessage" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "PushMessage_id_seq" TO figurints_app;
  END IF;
END $$;

-- Belt and braces, as in 20261103000001_terms_acceptance.
DO $$
DECLARE api_role text; t text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role);
    FOREACH t IN ARRAY ARRAY['PushDevice', 'NotificationPreference', 'PushMessage'] LOOP
      EXECUTE format('REVOKE ALL ON %I FROM %I', t, api_role);
      EXECUTE format('REVOKE ALL ON SEQUENCE %I FROM %I', t || '_id_seq', api_role);
    END LOOP;
  END LOOP;
END $$;
