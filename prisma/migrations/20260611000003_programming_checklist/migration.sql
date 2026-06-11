-- Per-event planning checklist for the Programming board.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The Kanban board's cards show a checklist progress bar (e.g. 2/3 done). Each
-- ProgrammingEvent gets a list of free-form checklist items (book room, design
-- flyer, order food, …) that members tick off as they plan. Follows the
-- conventions of every other org-scoped table: app-role GRANTs + sequence grant,
-- permissive allow_all RLS. Tenant isolation is enforced at the app layer
-- (lib/db/tenant.ts appends organizationId); RLS is defense-in-depth.

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE "ProgrammingChecklistItem" (
    "id"                 SERIAL       NOT NULL,
    "organizationId"     INTEGER      NOT NULL,
    "programmingEventId" INTEGER      NOT NULL,
    "label"              TEXT         NOT NULL,
    "done"               BOOLEAN      NOT NULL DEFAULT false,
    "sortOrder"          INTEGER      NOT NULL DEFAULT 0,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammingChecklistItem_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX "ProgrammingChecklistItem_organizationId_programmingEventId_idx"
    ON "ProgrammingChecklistItem"("organizationId", "programmingEventId");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
ALTER TABLE "ProgrammingChecklistItem" ADD CONSTRAINT "ProgrammingChecklistItem_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammingChecklistItem" ADD CONSTRAINT "ProgrammingChecklistItem_programmingEventId_fkey"
    FOREIGN KEY ("programmingEventId") REFERENCES "ProgrammingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── App-role GRANTs ──────────────────────────────────────────────────────────
-- figurints_app (non-BYPASSRLS) CRUDs through ctx.db. Sequence grant is required
-- or INSERT fails with "permission denied for sequence". Guarded for dev DBs.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProgrammingChecklistItem" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "ProgrammingChecklistItem_id_seq" TO figurints_app;
  END IF;
END $$;

-- ── RLS: enabled + permissive allow_all ──────────────────────────────────────
ALTER TABLE "ProgrammingChecklistItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON "ProgrammingChecklistItem";
CREATE POLICY allow_all ON "ProgrammingChecklistItem" USING (true) WITH CHECK (true);
