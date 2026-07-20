-- Demote social / fundy / program from built-in event types to org-owned customs.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- These three were seeded to every org as `events`-gated built-ins
-- (20260718000000_add_calendar_event_types), but they are LPE vocabulary, not
-- platform vocabulary. The registry (lib/event-types.ts) now ships 4 built-ins
-- (chapter / party / deadline / service); the Programming page derives its
-- category set per-org from CalendarEventType rows instead of a fixed list.
--
-- Data policy:
--   · LPE keeps all three as customs (builtin=false, workflowId=NULL) — its
--     seeded programming/calendar data references the slugs.
--   · Any other org that already has events referencing a slug keeps that type
--     as a custom too (deleting it would orphan the events' color/label).
--   · Unreferenced copies elsewhere are deleted — no LPE vocabulary imposed on
--     clean orgs. New orgs never get them (provisionOrg seeds from the
--     4-entry registry).
--
-- `builtin = true` guards every statement so an org's own custom type that
-- happens to share a slug is never touched. Idempotent by construction.

-- ── 1 · LPE: convert to custom ───────────────────────────────────────────────
UPDATE "CalendarEventType"
SET "builtin" = false, "workflowId" = NULL
WHERE "slug" IN ('social', 'fundy', 'program')
  AND "builtin" = true
  AND "organizationId" IN (SELECT "id" FROM "Organization" WHERE "slug" = 'lpe');

-- ── 2 · Other orgs: convert where referenced ─────────────────────────────────
UPDATE "CalendarEventType" t
SET "builtin" = false, "workflowId" = NULL
WHERE t."slug" IN ('social', 'fundy', 'program')
  AND t."builtin" = true
  AND (
    EXISTS (SELECT 1 FROM "CalendarEvent" e
            WHERE e."organizationId" = t."organizationId" AND e."category" = t."slug")
    OR EXISTS (SELECT 1 FROM "ProgrammingEvent" p
               WHERE p."organizationId" = t."organizationId" AND p."category" = t."slug")
  );

-- ── 3 · Delete the unreferenced rest ─────────────────────────────────────────
DELETE FROM "CalendarEventType"
WHERE "slug" IN ('social', 'fundy', 'program')
  AND "builtin" = true;
