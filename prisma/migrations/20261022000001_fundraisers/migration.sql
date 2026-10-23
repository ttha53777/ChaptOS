-- Fundraisers, the simple version: a dated sale (mirrored as a CalendarEvent of
-- the new built-in "fundraising" type), a shopping list, and one wrap-up total.
-- Not Treasury: nothing here writes or reads the ledger.
--
-- Additive: two new tables, plus the built-in event type seeded for every org.

-- CreateTable
CREATE TABLE "Fundraiser" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "calendarEventId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "goalCents" INTEGER,
    "cameInCents" INTEGER,
    "wrappedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fundraiser_pkey" PRIMARY KEY ("id"),
    CONSTRAINT fundraiser_kind CHECK ("kind" IN ('bake', 'drink', 'wash', 'raffle', 'other')),
    CONSTRAINT fundraiser_goal_positive CHECK ("goalCents" IS NULL OR "goalCents" > 0),
    CONSTRAINT fundraiser_came_in_nonneg CHECK ("cameInCents" IS NULL OR "cameInCents" >= 0)
);

-- CreateTable
CREATE TABLE "FundraiserSupply" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "fundraiserId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundraiserSupply_pkey" PRIMARY KEY ("id"),
    CONSTRAINT fundraiser_supply_cost_nonneg CHECK ("costCents" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Fundraiser_calendarEventId_key" ON "Fundraiser"("calendarEventId");

-- CreateIndex
CREATE INDEX "Fundraiser_organizationId_idx" ON "Fundraiser"("organizationId");

-- CreateIndex
CREATE INDEX "FundraiserSupply_organizationId_fundraiserId_idx" ON "FundraiserSupply"("organizationId", "fundraiserId");

-- AddForeignKey
ALTER TABLE "Fundraiser" ADD CONSTRAINT "Fundraiser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fundraiser" ADD CONSTRAINT "Fundraiser_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraiserSupply" ADD CONSTRAINT "FundraiserSupply_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraiserSupply" ADD CONSTRAINT "FundraiserSupply_fundraiserId_fkey" FOREIGN KEY ("fundraiserId") REFERENCES "Fundraiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No permissive policy: every new tenant table is isolated from day one.
ALTER TABLE "Fundraiser" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "Fundraiser" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);
ALTER TABLE "FundraiserSupply" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "FundraiserSupply" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Fundraiser" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "Fundraiser_id_seq" TO figurints_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "FundraiserSupply" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "FundraiserSupply_id_seq" TO figurints_app;
  END IF;
END $$;

-- The built-in "fundraising" event type, for every existing org (provisionOrg seeds
-- new ones from lib/event-types.ts). Not creatable from the Timeline: a fundraiser
-- event only exists alongside its Fundraiser row. Placed after the org's last type.
-- Deliberately not "fundraiser": that is the org-type starter Programming category
-- most orgs already own as a custom, creatable type (as is LPE's older "fundy").
-- Both stay untouched; ON CONFLICT only guards a hand-made "fundraising" type.
INSERT INTO "CalendarEventType"
  ("organizationId", "slug", "label", "color", "colorDark", "workflowId",
   "builtin", "creatable", "hidden", "mandatoryDefault", "displayOrder",
   "createdAt", "updatedAt")
SELECT o."id", 'fundraising', 'Fundraising', '#9c6b08', '#f0cc72', 'fundraisers',
       true, false, false, false,
       COALESCE((SELECT MAX(t."displayOrder") + 1 FROM "CalendarEventType" t WHERE t."organizationId" = o."id"), 0),
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
ON CONFLICT ("organizationId", "slug") DO NOTHING;

-- MANAGE_FUNDRAISING (1 << 14) for every role that already holds every older bit
-- (President-style roles); see GRANTED_ALL_PERMISSIONS in lib/permissions.ts.
UPDATE "Role" SET "permissions" = "permissions" | 16384
WHERE "permissions" & 16383 = 16383;
