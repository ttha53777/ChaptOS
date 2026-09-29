-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "timeZone" TEXT;

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "schedule" JSONB;

-- AlterTable
ALTER TABLE "ProgrammingEvent" ADD COLUMN     "schedule" JSONB;

-- CreateTable
CREATE TABLE "CalendarSubscription" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "publicId" TEXT NOT NULL,
    "tokenDigest" TEXT,
    "tokenCiphertext" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarFeedItem" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "uid" TEXT NOT NULL,
    "published" JSONB,
    "contentHash" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "retainUntil" TIMESTAMP(3),

    CONSTRAINT "CalendarFeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarFeedWork" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "appliedVersion" INTEGER NOT NULL DEFAULT 0,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failures" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CalendarFeedWork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSubscription_organizationId_key" ON "CalendarSubscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSubscription_publicId_key" ON "CalendarSubscription"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarFeedItem_uid_key" ON "CalendarFeedItem"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarFeedItem_organizationId_sourceType_sourceId_key" ON "CalendarFeedItem"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarFeedWork_organizationId_key" ON "CalendarFeedWork"("organizationId");

-- AddForeignKey
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarFeedItem" ADD CONSTRAINT "CalendarFeedItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarFeedWork" ADD CONSTRAINT "CalendarFeedWork_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Preserve scheduling identity across the existing delete/recreate programming
-- workflow. This ID is reserved for the same event; normal autoincrement never
-- allocates it again. No foreign key may clear it during demotion.
ALTER TABLE "ProgrammingEvent" ADD COLUMN "reservedCalendarEventId" INTEGER;
CREATE UNIQUE INDEX "ProgrammingEvent_reservedCalendarEventId_key" ON "ProgrammingEvent"("reservedCalendarEventId");
UPDATE "ProgrammingEvent" SET "reservedCalendarEventId" = "calendarEventId" WHERE "calendarEventId" IS NOT NULL;

-- No permissive policy: every new tenant table is isolated from day one.
ALTER TABLE "CalendarSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarFeedItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarFeedWork" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "CalendarSubscription" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);
CREATE POLICY org_isolation ON "CalendarFeedItem" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);
CREATE POLICY org_isolation ON "CalendarFeedWork" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);
ALTER TABLE "CalendarFeedItem" ADD CONSTRAINT calendar_feed_source CHECK ("sourceType" IN ('calendar', 'task'));
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT calendar_feed_enabled CHECK (NOT enabled OR ("tokenDigest" IS NOT NULL AND "tokenCiphertext" IS NOT NULL AND "validatedAt" IS NOT NULL));

-- Legacy writers may change date/time without knowing about schedule. Invalidate
-- the structured value rather than publishing an obsolete time after a move.
CREATE FUNCTION calendar_schedule_invalidate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.date IS DISTINCT FROM OLD.date OR NEW.time IS DISTINCT FROM OLD.time)
     AND NEW.schedule IS NOT DISTINCT FROM OLD.schedule THEN NEW.schedule := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER calendar_schedule_invalidate BEFORE UPDATE ON "CalendarEvent" FOR EACH ROW EXECUTE FUNCTION calendar_schedule_invalidate();
CREATE TRIGGER programming_schedule_invalidate BEFORE UPDATE ON "ProgrammingEvent" FOR EACH ROW EXECUTE FUNCTION calendar_schedule_invalidate();

CREATE FUNCTION calendar_feed_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant integer;
BEGIN
  IF TG_OP = 'DELETE' THEN tenant := OLD."organizationId"; ELSE tenant := NEW."organizationId"; END IF;
  INSERT INTO "CalendarFeedWork" ("organizationId", version, "appliedVersion", "enqueuedAt", failures)
    VALUES (tenant, 1, 0, CURRENT_TIMESTAMP, 0)
    ON CONFLICT ("organizationId") DO UPDATE SET version = "CalendarFeedWork".version + 1,
      "enqueuedAt" = CASE WHEN "CalendarFeedWork".version = "CalendarFeedWork"."appliedVersion" THEN CURRENT_TIMESTAMP ELSE "CalendarFeedWork"."enqueuedAt" END;
  RETURN NULL;
END $$;
-- Capturing at the database boundary covers deletes, bulk writes, transaction
-- clients and indirect writes. Delivery is durable even if the process dies
-- between COMMIT and emit(). No snapshot can arrive out of order.
CREATE TRIGGER calendar_feed_enqueue AFTER INSERT OR UPDATE OR DELETE ON "CalendarEvent" FOR EACH ROW EXECUTE FUNCTION calendar_feed_enqueue();
CREATE TRIGGER task_feed_enqueue AFTER INSERT OR UPDATE OR DELETE ON "Task" FOR EACH ROW EXECUTE FUNCTION calendar_feed_enqueue();
CREATE TRIGGER programming_feed_enqueue AFTER INSERT OR UPDATE OR DELETE ON "ProgrammingEvent" FOR EACH ROW EXECUTE FUNCTION calendar_feed_enqueue();
CREATE TRIGGER service_feed_enqueue AFTER INSERT OR UPDATE OR DELETE ON "ServiceEvent" FOR EACH ROW EXECUTE FUNCTION calendar_feed_enqueue();
CREATE TRIGGER party_feed_enqueue AFTER INSERT OR UPDATE OR DELETE ON "PartyEvent" FOR EACH ROW EXECUTE FUNCTION calendar_feed_enqueue();

-- Provision inert rows even when the rollout/encryption key is not configured.
-- The operator provisioning command fills credentials before validation/enable.
CREATE FUNCTION calendar_feed_provision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "CalendarSubscription" ("organizationId", "publicId", enabled, generation, "createdAt", "updatedAt")
    VALUES (NEW.id, gen_random_uuid()::text, false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO "CalendarFeedWork" ("organizationId") VALUES (NEW.id);
  RETURN NULL;
END $$;
CREATE TRIGGER calendar_feed_provision AFTER INSERT ON "Organization" FOR EACH ROW EXECUTE FUNCTION calendar_feed_provision();
INSERT INTO "CalendarSubscription" ("organizationId", "publicId", enabled, generation, "createdAt", "updatedAt")
  SELECT id, gen_random_uuid()::text, false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Organization";
INSERT INTO "CalendarFeedWork" ("organizationId") SELECT id FROM "Organization";

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "CalendarSubscription", "CalendarFeedItem", "CalendarFeedWork" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "CalendarSubscription_id_seq", "CalendarFeedItem_id_seq", "CalendarFeedWork_id_seq" TO figurints_app;
  END IF;
END $$;

CREATE FUNCTION calendar_feed_org_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug OR NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE "CalendarFeedWork" SET version = version + 1,
      "enqueuedAt" = CASE WHEN version = "appliedVersion" THEN CURRENT_TIMESTAMP ELSE "enqueuedAt" END
      WHERE "organizationId" = NEW.id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER calendar_feed_org_changed AFTER UPDATE ON "Organization" FOR EACH ROW EXECUTE FUNCTION calendar_feed_org_changed();
