-- Custom org metrics: admin-defined per-member numeric metrics with goal/at-risk
-- thresholds, plus the per-member values. Two new tables:
--   OrgMetricDefinition  — the metric template (slug, goal, thresholds, aggregation).
--   BrotherMetricValue   — one row per (member, metric) holding the recorded value.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The custom-member-fields work (20260610000000) covers free-form member
-- attributes; this covers *numeric, goal-tracked* metrics (service hours, reps,
-- attendance %) that the dashboard scores as on-track / watch / at-risk. The
-- models live in schema.prisma (OrgMetricDefinition, BrotherMetricValue) and the
-- generated client already knows them; this migration is what was missing — the
-- tables were never created, so /api/auth/me's orgMetricDefinition.count() blew
-- up with "relation does not exist" (P1014) and returned 500.
--
-- Mirrors the conventions of the existing org-scoped tables (see
-- 20260602000000_org_invites): app-role GRANTs + sequence grants, CHECK
-- constraint for the stable aggregation enum, permissive allow_all RLS. Tenant
-- isolation is enforced at the app layer (lib/db/tenant.ts appends
-- organizationId); RLS is defense-in-depth and stays permissive.

-- ── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE "OrgMetricDefinition" (
    "id"             SERIAL       NOT NULL,
    "organizationId" INTEGER      NOT NULL,
    "slug"           TEXT         NOT NULL,
    "name"           TEXT         NOT NULL,
    "unit"           TEXT,
    "goal"           DOUBLE PRECISION NOT NULL,
    "atRiskBelow"    DOUBLE PRECISION NOT NULL,
    "watchBelow"     DOUBLE PRECISION,
    "aggregation"    TEXT         NOT NULL,
    "displayOrder"   INTEGER      NOT NULL DEFAULT 0,
    "deletedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMetricDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrotherMetricValue" (
    "id"                 SERIAL       NOT NULL,
    "brotherId"          INTEGER      NOT NULL,
    "metricDefinitionId" INTEGER      NOT NULL,
    "organizationId"     INTEGER      NOT NULL,
    "value"              DOUBLE PRECISION NOT NULL,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrotherMetricValue_pkey" PRIMARY KEY ("id")
);

-- ── Indexes / uniqueness ─────────────────────────────────────────────────────
CREATE UNIQUE INDEX "OrgMetricDefinition_organizationId_slug_key" ON "OrgMetricDefinition"("organizationId", "slug");
CREATE INDEX "OrgMetricDefinition_organizationId_deletedAt_idx" ON "OrgMetricDefinition"("organizationId", "deletedAt");
CREATE UNIQUE INDEX "BrotherMetricValue_brotherId_metricDefinitionId_key" ON "BrotherMetricValue"("brotherId", "metricDefinitionId");
CREATE INDEX "BrotherMetricValue_organizationId_metricDefinitionId_idx" ON "BrotherMetricValue"("organizationId", "metricDefinitionId");
CREATE INDEX "BrotherMetricValue_brotherId_idx" ON "BrotherMetricValue"("brotherId");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
ALTER TABLE "OrgMetricDefinition" ADD CONSTRAINT "OrgMetricDefinition_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrotherMetricValue" ADD CONSTRAINT "BrotherMetricValue_brotherId_fkey"
    FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrotherMetricValue" ADD CONSTRAINT "BrotherMetricValue_metricDefinitionId_fkey"
    FOREIGN KEY ("metricDefinitionId") REFERENCES "OrgMetricDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CHECK constraint: aggregation is a stable enum ───────────────────────────
ALTER TABLE "OrgMetricDefinition" ADD CONSTRAINT "OrgMetricDefinition_aggregation_check"
    CHECK ("aggregation" IN ('avg', 'sum', 'count_on_track'));

-- ── App-role GRANTs ──────────────────────────────────────────────────────────
-- The figurints_app role (non-BYPASSRLS) CRUDs both tables through ctx.db.
-- Guarded so dev DBs that still connect as postgres skip cleanly. GRANT is
-- idempotent; sequence grants are required or INSERT fails with "permission
-- denied for sequence".
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "OrgMetricDefinition" TO figurints_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "BrotherMetricValue"  TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "OrgMetricDefinition_id_seq"  TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "BrotherMetricValue_id_seq"   TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all, matching every other org-scoped table ─
ALTER TABLE "OrgMetricDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrotherMetricValue"  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "OrgMetricDefinition";
DROP POLICY IF EXISTS allow_all ON "BrotherMetricValue";
CREATE POLICY allow_all ON "OrgMetricDefinition" USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON "BrotherMetricValue"  USING (true) WITH CHECK (true);
