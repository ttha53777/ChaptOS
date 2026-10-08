-- Shared meeting-agenda templates, copied into a new meeting's notes on Add
-- meeting. Additive only: one new table, two nullable CalendarEvent columns.
CREATE TABLE "AgendaTemplate" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaTemplate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT agenda_template_category CHECK ("category" IN ('meetings', 'leadership', 'committees'))
);

CREATE INDEX "AgendaTemplate_organizationId_archivedAt_idx" ON "AgendaTemplate"("organizationId", "archivedAt");
-- One live default per org. An archived default is cleared by the service, but
-- the index only counts live rows so a restore can never trip it.
CREATE UNIQUE INDEX "AgendaTemplate_one_default_per_org" ON "AgendaTemplate"("organizationId") WHERE "isDefault" AND "archivedAt" IS NULL;

ALTER TABLE "AgendaTemplate" ADD CONSTRAINT "AgendaTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent" ADD COLUMN "agendaTemplateId" INTEGER;
ALTER TABLE "CalendarEvent" ADD COLUMN "notesSeed" TEXT;
CREATE INDEX "CalendarEvent_agendaTemplateId_idx" ON "CalendarEvent"("agendaTemplateId");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_agendaTemplateId_fkey" FOREIGN KEY ("agendaTemplateId") REFERENCES "AgendaTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- No permissive policy: every new tenant table is isolated from day one.
ALTER TABLE "AgendaTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "AgendaTemplate" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AgendaTemplate" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "AgendaTemplate_id_seq" TO figurints_app;
  END IF;
END $$;
