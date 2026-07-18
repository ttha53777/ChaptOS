-- Per-org configurable timeline event types (a.k.a. "categories").
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- CalendarEvent.category was a fixed 7-value enum pinned by a CHECK constraint
-- (20260529000000_phase25_state_checks) and hardcoded across the client. This
-- makes event types a per-org, admin-editable resource: every org is seeded with
-- the 7 built-ins (lib/event-types.ts) and may add custom types or
-- rename/recolor/reorder any of them. Picker visibility is derived at read time
-- from OrganizationConfig.enabledWorkflows; the row always exists so existing
-- events keep resolving their color/label even when the workflow is off.
--
-- Model lives in schema.prisma (CalendarEventType); this migration creates the
-- table, seeds the 7 built-ins for every existing org, and drops the now-obsolete
-- category CHECK (it would reject custom slugs).
--
-- Mirrors 20260610000001_add_org_metrics: app-role GRANTs + sequence grant,
-- permissive allow_all RLS plus the dormant org_isolation policy (matching the
-- current Phase-3/Phase-4-revert dual-policy state). Tenant isolation is enforced
-- at the app layer (lib/db/tenant.ts appends organizationId); there is NO FK from
-- CalendarEvent.category — integrity is validated in the service layer.

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CalendarEventType" (
    "id"               SERIAL       NOT NULL,
    "organizationId"   INTEGER      NOT NULL,
    "slug"             TEXT         NOT NULL,
    "label"            TEXT         NOT NULL,
    "color"            TEXT         NOT NULL,
    "colorDark"        TEXT,
    "workflowId"       TEXT,
    "builtin"          BOOLEAN      NOT NULL DEFAULT false,
    "creatable"        BOOLEAN      NOT NULL DEFAULT true,
    "hidden"           BOOLEAN      NOT NULL DEFAULT false,
    "mandatoryDefault" BOOLEAN      NOT NULL DEFAULT false,
    "displayOrder"     INTEGER      NOT NULL DEFAULT 0,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEventType_pkey" PRIMARY KEY ("id")
);

-- ── Indexes / uniqueness ─────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarEventType_organizationId_slug_key"
    ON "CalendarEventType"("organizationId", "slug");
CREATE INDEX IF NOT EXISTS "CalendarEventType_organizationId_idx"
    ON "CalendarEventType"("organizationId");

-- ── Foreign key ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarEventType_organizationId_fkey') THEN
    ALTER TABLE "CalendarEventType" ADD CONSTRAINT "CalendarEventType_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── App-role GRANTs ──────────────────────────────────────────────────────────
-- figurints_app (non-BYPASSRLS) CRUDs through ctx.db. Guarded so dev DBs that
-- still connect as postgres skip cleanly. The sequence grant is required or
-- INSERT fails with "permission denied for sequence".
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "CalendarEventType" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "CalendarEventType_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: permissive allow_all + dormant org_isolation (dual-policy state) ──────
-- org_isolation expression copied verbatim from tests/setup/rls.ts (the Phase-3
-- source of truth). allow_all ORs it away today; if Phase 4 re-drops allow_all,
-- this table isolates like every other org-scoped table.
ALTER TABLE "CalendarEventType" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "CalendarEventType";
CREATE POLICY allow_all ON "CalendarEventType" USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS org_isolation ON "CalendarEventType";
CREATE POLICY org_isolation ON "CalendarEventType"
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

-- ── Backfill: seed the 7 built-ins for every existing org ─────────────────────
-- createdAt/updatedAt are listed explicitly — @updatedAt is a Prisma-client
-- default, not a DB default, so a raw INSERT must set it. ON CONFLICT DO NOTHING
-- makes re-application safe. The old CHECK guarantees every existing
-- CalendarEvent.category is within these 7 slugs, so this backfill is sufficient.
INSERT INTO "CalendarEventType"
  ("organizationId", "slug", "label", "color", "colorDark", "workflowId",
   "builtin", "creatable", "hidden", "mandatoryDefault", "displayOrder",
   "createdAt", "updatedAt")
SELECT o."id", v.slug, v.label, v.color, v.color_dark, v.workflow_id,
       true, v.creatable, false, v.mandatory_default, v.display_order,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
  ('chapter',  'Chapter',           '#3f6ea3', '#8fb0d6', 'meetings', true,  true,  0),
  ('social',   'Social',            '#9a7224', '#ddb36a', 'events',   false, true,  1),
  ('fundy',    'Fundraiser',        '#4a7d4c', '#86b988', 'events',   false, true,  2),
  ('program',  'Program',           '#6d28d9', '#a78bfa', 'events',   false, true,  3),
  ('party',    'Party',             '#b34f72', '#d98ba3', 'parties',  false, false, 4),
  ('deadline', 'Deadline',          '#c14a37', '#e0796b', 'tasks',    false, false, 5),
  ('service',  'Community Service', '#2f8579', '#5fbdb0', 'service',  false, true,  6)
) AS v(slug, label, color, color_dark, workflow_id, mandatory_default, creatable, display_order)
ON CONFLICT ("organizationId", "slug") DO NOTHING;

-- ── Drop the obsolete category CHECK ─────────────────────────────────────────
-- It hardcodes the 7 slugs and would reject custom event-type slugs. Validity is
-- now enforced per-org in the service layer against CalendarEventType rows.
ALTER TABLE "CalendarEvent" DROP CONSTRAINT IF EXISTS "CalendarEvent_category_check";
