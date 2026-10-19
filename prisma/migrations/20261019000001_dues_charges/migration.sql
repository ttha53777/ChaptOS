-- Dues as charges: a named, dated bill per group of members, one line per person,
-- and recorded waivers. Membership.duesOwed stays the stored balance; from here on
-- every write that moves it also writes one of these rows, so the balance can be
-- read back line by line (see lib/services/dues-charge-service.ts).
--
-- Additive: three new tables, one nullable OrganizationConfig column, and a
-- backfill that turns every existing balance into one "Earlier balance" charge.

-- AlterTable
ALTER TABLE "OrganizationConfig" ADD COLUMN     "duesLedgerStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DuesCharge" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "dueDate" TEXT,
    "note" TEXT,
    "audienceKind" TEXT NOT NULL,
    "audienceLabel" TEXT NOT NULL,
    "rateCard" JSONB,
    "semesterId" INTEGER,
    "createdById" INTEGER,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuesCharge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT dues_charge_audience_kind CHECK ("audienceKind" IN ('all', 'role', 'pick', 'single', 'carryover'))
);

-- CreateTable
CREATE TABLE "DuesChargeLine" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "chargeId" INTEGER NOT NULL,
    "brotherId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuesChargeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuesWaiver" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "brotherId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "chargeId" INTEGER,
    "createdById" INTEGER,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuesWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuesCharge_organizationId_voidedAt_idx" ON "DuesCharge"("organizationId", "voidedAt");

-- CreateIndex
CREATE INDEX "DuesCharge_organizationId_semesterId_idx" ON "DuesCharge"("organizationId", "semesterId");

-- CreateIndex
CREATE INDEX "DuesChargeLine_organizationId_brotherId_idx" ON "DuesChargeLine"("organizationId", "brotherId");

-- CreateIndex
CREATE UNIQUE INDEX "DuesChargeLine_chargeId_brotherId_key" ON "DuesChargeLine"("chargeId", "brotherId");

-- CreateIndex
CREATE INDEX "DuesWaiver_organizationId_brotherId_idx" ON "DuesWaiver"("organizationId", "brotherId");

-- AddForeignKey
ALTER TABLE "DuesCharge" ADD CONSTRAINT "DuesCharge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesCharge" ADD CONSTRAINT "DuesCharge_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesChargeLine" ADD CONSTRAINT "DuesChargeLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesChargeLine" ADD CONSTRAINT "DuesChargeLine_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "DuesCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesChargeLine" ADD CONSTRAINT "DuesChargeLine_brotherId_fkey" FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesWaiver" ADD CONSTRAINT "DuesWaiver_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesWaiver" ADD CONSTRAINT "DuesWaiver_brotherId_fkey" FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesWaiver" ADD CONSTRAINT "DuesWaiver_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "DuesCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Amounts are positive: a waiver or a payment is what lowers a tab, never a negative line.
ALTER TABLE "DuesChargeLine" ADD CONSTRAINT dues_charge_line_positive CHECK ("amountCents" > 0);
ALTER TABLE "DuesWaiver" ADD CONSTRAINT dues_waiver_positive CHECK ("amountCents" > 0);

-- No permissive policy: every new tenant table is isolated from day one.
ALTER TABLE "DuesCharge" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "DuesCharge" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);
ALTER TABLE "DuesChargeLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "DuesChargeLine" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);
ALTER TABLE "DuesWaiver" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "DuesWaiver" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "DuesCharge" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "DuesCharge_id_seq" TO figurints_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "DuesChargeLine" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "DuesChargeLine_id_seq" TO figurints_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "DuesWaiver" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "DuesWaiver_id_seq" TO figurints_app;
  END IF;
END $$;

-- BACKFILL BEGIN (tests/treasury/dues-backfill.test.ts runs this block verbatim)
--
-- Every org that exists today predates charges, so every org gets a cutover. Dues
-- payments created before it are already netted into duesOwed; the allocator
-- skips them (OrganizationConfig.duesLedgerStartedAt).
--
-- Prisma stores TIMESTAMP(3) as UTC wall time, so every timestamp written here is
-- pinned to UTC: a bare CURRENT_TIMESTAMP is converted to the SESSION's zone, and
-- a cutover hours off in either direction would count (or drop) real payments.
INSERT INTO "OrganizationConfig" ("organizationId", "updatedAt")
SELECT o."id", (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') FROM "Organization" o
ON CONFLICT ("organizationId") DO NOTHING;

UPDATE "OrganizationConfig" SET "duesLedgerStartedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
WHERE "duesLedgerStartedAt" IS NULL;

-- Each balance still owed becomes a line on one "Earlier balance" charge per org:
-- no due date (never overdue — nobody knows when it was meant to be paid), no term.
-- Rounded to cents the same way lib/money.ts toCents does; a float residue under
-- half a cent is nothing owed.
INSERT INTO "DuesCharge" ("organizationId", "name", "audienceKind", "audienceLabel", "createdAt", "updatedAt")
SELECT DISTINCT m."organizationId", 'Earlier balance', 'carryover', 'Carried over', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
FROM "Membership" m
WHERE ROUND(m."duesOwed"::numeric * 100) > 0;

INSERT INTO "DuesChargeLine" ("organizationId", "chargeId", "brotherId", "amountCents", "createdAt")
SELECT m."organizationId", c."id", m."brotherId", ROUND(m."duesOwed"::numeric * 100)::integer, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
FROM "Membership" m
JOIN "DuesCharge" c ON c."organizationId" = m."organizationId" AND c."audienceKind" = 'carryover'
WHERE ROUND(m."duesOwed"::numeric * 100) > 0;
-- BACKFILL END
