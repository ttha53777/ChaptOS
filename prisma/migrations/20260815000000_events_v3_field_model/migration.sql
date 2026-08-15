-- Events v3: replace the prep-boolean model with a FIELD model.
--
-- WHAT THIS DELETES AND WHY. The events page decided whether an event could be
-- Confirmed using four hardcoded booleans on ProgrammingEvent — roomStatus,
-- flyerPosted, socialsMeeting, itineraryNotNeeded. Beside them sat a second,
-- optional, free-text list (ProgrammingChecklistItem) that gated nothing. Two
-- lists both called "checklist", one of which was four booleans hardcoded for one
-- kind of org:
--
--   1. It didn't generalize. "Flyer posted" and "socials mtg" gated confirming for
--      EVERY org on the platform. A nonprofit chapter has no socials meeting and
--      could not confirm an event without lying about one.
--   2. It wasn't checkable. flyerPosted is self-attested — I clicked it, therefore
--      it's true. A date and a location are facts, and "Confirmed" publishes to
--      the whole chapter's calendar.
--   3. The lanes meant nothing distinct. stageRequiresCalendar was `stage != idea`,
--      so PLANNING already published to the Timeline and already required a date.
--      Idea→Planning was a drag that recorded a decision with no consequence.
--
-- In its place: an event's readiness IS its own fields. Six required
-- (title · category · owner · date · location · mandatory), gating the lanes
-- cumulatively, plus an ORG-DEFINED optional set every event answers the same way.
--
-- THE ONE STEP THAT CHANGES WHAT PEOPLE SEE is step 5, the publish-boundary
-- sweep. The Timeline mirror now starts at Confirmed instead of Planning, so
-- every existing Planning event either moves up (it has a date and a location, so
-- it was already a real commitment) or loses its CalendarEvent (it was on
-- everyone's calendar without one). Both counts are RAISE NOTICE'd per org.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING throughout). Carries the
-- standard org-scoped-table boilerplate: app-role CRUD + sequence grants (see
-- 20260611000004_programming_app_grants for the cautionary tale of omitting the
-- sequence grant) and, since Phase 4 RLS is enforcing, a direct `org_isolation`
-- policy rather than the historical permissive allow_all.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1 · EventFieldDefinition — the org's optional field vocabulary
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "EventFieldDefinition" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "slug"           TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "enabled"        BOOLEAN NOT NULL DEFAULT true,
  "builtin"        BOOLEAN NOT NULL DEFAULT false,
  "displayOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventFieldDefinition_organizationId_fkey') THEN
    ALTER TABLE "EventFieldDefinition"
      ADD CONSTRAINT "EventFieldDefinition_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "EventFieldDefinition_organizationId_slug_key"
  ON "EventFieldDefinition" ("organizationId", "slug");
CREATE INDEX IF NOT EXISTS "EventFieldDefinition_organizationId_idx"
  ON "EventFieldDefinition" ("organizationId");

-- Kind CHECK, mirroring FIELD_KINDS in lib/event-fields.ts. Same posture as
-- Transaction_type_check and transaction_category_kind_check: the union lives in
-- TypeScript, the DB pins it so a bad write fails loudly instead of quietly
-- producing a field nothing knows how to render.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_field_definition_kind_check') THEN
    ALTER TABLE "EventFieldDefinition"
      ADD CONSTRAINT "event_field_definition_kind_check"
      CHECK ("kind" IN ('text', 'num', 'money', 'bool', 'date', 'person', 'file'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "EventFieldDefinition" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "EventFieldDefinition_id_seq" TO figurints_app;
  END IF;
END $$;

ALTER TABLE "EventFieldDefinition" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON "EventFieldDefinition";
CREATE POLICY org_isolation ON "EventFieldDefinition"
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2 · ProgrammingEvent — owner FKs + fieldValues
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "ProgrammingEvent"
  ADD COLUMN IF NOT EXISTS "ownerBrotherId" INTEGER,
  ADD COLUMN IF NOT EXISTS "ownerRoleId"    INTEGER,
  ADD COLUMN IF NOT EXISTS "ownerNote"      TEXT,
  ADD COLUMN IF NOT EXISTS "fieldValues"    JSONB NOT NULL DEFAULT '{}';

-- ON DELETE SET NULL, deliberately NOT CASCADE. AttendanceRecord.brotherId
-- cascades because it is a join row; this is an owning column, and the FK carries
-- no org filter — a person leaving ONE org must not erase another org's events.
-- (AGENTS.md: removing a member from one org is not DELETE FROM Brother.)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProgrammingEvent_ownerBrotherId_fkey') THEN
    ALTER TABLE "ProgrammingEvent"
      ADD CONSTRAINT "ProgrammingEvent_ownerBrotherId_fkey"
      FOREIGN KEY ("ownerBrotherId") REFERENCES "Brother"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProgrammingEvent_ownerRoleId_fkey') THEN
    ALTER TABLE "ProgrammingEvent"
      ADD CONSTRAINT "ProgrammingEvent_ownerRoleId_fkey"
      FOREIGN KEY ("ownerRoleId") REFERENCES "Role"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ProgrammingEvent_organizationId_ownerBrotherId_idx"
  ON "ProgrammingEvent" ("organizationId", "ownerBrotherId");
CREATE INDEX IF NOT EXISTS "ProgrammingEvent_organizationId_ownerRoleId_idx"
  ON "ProgrammingEvent" ("organizationId", "ownerRoleId");

-- ── The publish boundary, as a CHECK ──────────────────────────────────────────
-- The old constraint was `stage = 'idea' OR calendarEventId IS NOT NULL`: it
-- encoded "everything above Idea is on the chapter's calendar", which is exactly
-- the rule this migration moves. Left in place it would reject every Planning
-- event the moment step 5 unpublishes it, and every future Idea→Planning promote.
--
-- Replaced rather than dropped, because the invariant it protects is still real —
-- it just sits one lane later: a CONFIRMED or DONE event must have a
-- CalendarEvent, and an Idea or Planning event must not pretend to.
ALTER TABLE "ProgrammingEvent" DROP CONSTRAINT IF EXISTS "ProgrammingEvent_stage_calendar_check";

-- Kept separate from the ADD below so the sweep in step 5 runs with no stage
-- constraint at all — it moves rows and their calendar links in several
-- statements, and an intermediate state would trip either version.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3 · Seed the ten built-in fields per org
-- ═══════════════════════════════════════════════════════════════════════════════
-- Mirrors BUILTIN_EVENT_FIELDS in lib/event-fields.ts. Five on by default (the
-- questions almost every org asks about almost every event), five off (real but
-- not universal — one tap to enable, invisible to orgs that don't need them).
--
-- `description`, `attachment` and `cohost` are backed by EXISTING COLUMNS
-- (description / attachmentUrl+attachmentDocId / collabOrg). They are seeded as
-- definitions so an org can switch them off like any other optional field, but no
-- data is copied into fieldValues — a second copy in JSON would drift from the
-- column, which is why sanitizeFieldValues drops those keys.
INSERT INTO "EventFieldDefinition"
  ("organizationId", "slug", "label", "kind", "enabled", "builtin", "displayOrder", "createdAt", "updatedAt")
SELECT o."id", v.slug, v.label, v.kind, v.enabled, true, v.display_order,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
  ('description', 'Description',      'text',  true,  0),
  ('budget',      'Budget',           'money', true,  1),
  ('attachment',  'Attachment',       'file',  true,  2),
  ('headcount',   'Head count',       'num',   true,  3),
  ('cohost',      'Co-host',          'text',  true,  4),
  ('contact',     'Point of contact', 'text',  false, 5),
  ('setup',       'Setup time',       'text',  false, 6),
  ('risk',        'Risk form',        'bool',  false, 7),
  ('dress',       'Dress code',       'text',  false, 8),
  ('transport',   'Transportation',   'text',  false, 9)
) AS v(slug, label, kind, enabled, display_order)
ON CONFLICT ("organizationId", "slug") DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4 · Owner backfill — free-text `owner` → ownerBrotherId, or ownerNote
-- ═══════════════════════════════════════════════════════════════════════════════
-- Match case-insensitively against Membership.name first (the name THIS org uses,
-- which is what an officer typed) and then Brother.name, always WITHIN THE SAME
-- ORG. A name that matches two people is not a match — guessing which Chris owns
-- the formal is worse than admitting we don't know.
DO $$
DECLARE
  matched   INTEGER := 0;
  unmatched INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ProgrammingEvent' AND column_name = 'owner') THEN

    -- Unique match on the org-local roster name.
    WITH candidates AS (
      SELECT pe."id" AS event_id,
             MIN(m."brotherId") AS brother_id,
             COUNT(DISTINCT m."brotherId") AS n
      FROM "ProgrammingEvent" pe
      JOIN "Membership" m
        ON m."organizationId" = pe."organizationId"
       AND lower(trim(COALESCE(m."name", ''))) = lower(trim(pe."owner"))
      WHERE trim(COALESCE(pe."owner", '')) <> ''
      GROUP BY pe."id"
    )
    UPDATE "ProgrammingEvent" pe
    SET "ownerBrotherId" = c.brother_id
    FROM candidates c
    WHERE pe."id" = c.event_id AND c.n = 1;

    GET DIAGNOSTICS matched = ROW_COUNT;

    -- Fall back to the account-canonical Brother.name for anyone whose org row
    -- carries no local name (Membership.name is nullable and falls back to it).
    WITH candidates AS (
      SELECT pe."id" AS event_id,
             MIN(b."id") AS brother_id,
             COUNT(DISTINCT b."id") AS n
      FROM "ProgrammingEvent" pe
      JOIN "Membership" m ON m."organizationId" = pe."organizationId"
      JOIN "Brother" b    ON b."id" = m."brotherId"
      WHERE pe."ownerBrotherId" IS NULL
        AND trim(COALESCE(pe."owner", '')) <> ''
        AND lower(trim(b."name")) = lower(trim(pe."owner"))
      GROUP BY pe."id"
    )
    UPDATE "ProgrammingEvent" pe
    SET "ownerBrotherId" = c.brother_id
    FROM candidates c
    WHERE pe."id" = c.event_id AND c.n = 1;

    -- Everything left over is preserved verbatim as a read-only note rather than
    -- dropped. It is NOT an owner and does not satisfy the Planning gate; it
    -- exists so an officer can see whose name was there and re-own by hand.
    UPDATE "ProgrammingEvent"
    SET "ownerNote" = trim("owner")
    WHERE "ownerBrotherId" IS NULL
      AND "ownerRoleId" IS NULL
      AND trim(COALESCE("owner", '')) <> '';

    GET DIAGNOSTICS unmatched = ROW_COUNT;
    RAISE NOTICE 'Owner backfill: % matched to a roster member, % kept as ownerNote', matched, unmatched;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5 · Publish-boundary sweep — Planning no longer publishes
-- ═══════════════════════════════════════════════════════════════════════════════
-- The Timeline mirror now starts at Confirmed. Every Planning event is therefore
-- resolved one way or the other:
--
--   HAS a date AND a location  → promoted to Confirmed. It was already a real
--                                commitment and it KEEPS its CalendarEvent, so
--                                nothing disappears from anyone's calendar.
--   otherwise                  → stays Planning and LOSES its CalendarEvent. It
--                                was on the whole chapter's calendar without a
--                                time or a place; that is what this change fixes.
--
-- Demotion order mirrors setStage exactly: delete the dependent ServiceEvent,
-- NULL ProgrammingEvent.calendarEventId, and only THEN delete the CalendarEvent —
-- so the FK's SET NULL never races the row delete.
DO $$
DECLARE
  r          RECORD;
  promoted   INTEGER;
  demoted    INTEGER;
BEGIN
  FOR r IN SELECT DISTINCT "organizationId" AS org FROM "ProgrammingEvent" WHERE "stage" = 'planning' LOOP

    UPDATE "ProgrammingEvent"
    SET "stage" = 'confirmed'
    WHERE "organizationId" = r.org
      AND "stage" = 'planning'
      AND "date" IS NOT NULL AND trim("date") <> ''
      AND "location" IS NOT NULL AND trim("location") <> '';
    GET DIAGNOSTICS promoted = ROW_COUNT;

    -- The remainder: unpublish. Capture the calendar ids first, since nulling the
    -- link is what makes them un-findable from the event afterwards.
    CREATE TEMP TABLE IF NOT EXISTS _demote_ids (cal_id INTEGER PRIMARY KEY) ON COMMIT DROP;
    TRUNCATE _demote_ids;

    INSERT INTO _demote_ids (cal_id)
    SELECT "calendarEventId" FROM "ProgrammingEvent"
    WHERE "organizationId" = r.org AND "stage" = 'planning' AND "calendarEventId" IS NOT NULL;

    DELETE FROM "ServiceEvent" WHERE "calendarEventId" IN (SELECT cal_id FROM _demote_ids);

    UPDATE "ProgrammingEvent"
    SET "calendarEventId" = NULL
    WHERE "organizationId" = r.org AND "stage" = 'planning' AND "calendarEventId" IS NOT NULL;
    GET DIAGNOSTICS demoted = ROW_COUNT;

    -- Attendance rows and excuses hang off CalendarEvent; a Planning event with
    -- no date or location has none, but clear them defensively so the delete
    -- cannot fail on an FK and abort the whole migration.
    DELETE FROM "AttendanceRecord"        WHERE "calendarEventId" IN (SELECT cal_id FROM _demote_ids);
    DELETE FROM "AttendanceExcuse"        WHERE "calendarEventId" IN (SELECT cal_id FROM _demote_ids);
    DELETE FROM "TransactionCalendarEvent" WHERE "calendarEventId" IN (SELECT cal_id FROM _demote_ids);
    UPDATE "InstagramTask" SET "calendarEventId" = NULL
      WHERE "calendarEventId" IN (SELECT cal_id FROM _demote_ids);
    UPDATE "PartyEvent" SET "attendanceEventId" = NULL
      WHERE "attendanceEventId" IN (SELECT cal_id FROM _demote_ids);

    DELETE FROM "CalendarEvent" WHERE "id" IN (SELECT cal_id FROM _demote_ids);

    RAISE NOTICE 'Org %: % planning events promoted to confirmed (kept on the Timeline), % unpublished (CalendarEvent deleted)',
      r.org, promoted, demoted;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6 · Drop the retired model and columns
-- ═══════════════════════════════════════════════════════════════════════════════
-- Last, so every step above could still read them.
--
-- itineraryUrl was already deprecated and backfilled into attachmentUrl; the
-- other four are the prep booleans this whole change exists to remove.
DROP TABLE IF EXISTS "ProgrammingChecklistItem";

-- Dropping roomStatus takes its CHECK with it; name it anyway in case a future
-- rerun finds the column already gone and the constraint orphaned.
ALTER TABLE "ProgrammingEvent" DROP CONSTRAINT IF EXISTS "ProgrammingEvent_roomStatus_check";

ALTER TABLE "ProgrammingEvent"
  DROP COLUMN IF EXISTS "owner",
  DROP COLUMN IF EXISTS "roomStatus",
  DROP COLUMN IF EXISTS "itineraryNotNeeded",
  DROP COLUMN IF EXISTS "flyerPosted",
  DROP COLUMN IF EXISTS "socialsMeeting",
  DROP COLUMN IF EXISTS "itineraryUrl";

-- ── 7 · Re-assert the publish boundary, one lane later ────────────────────────
-- Now that every row sits on the correct side of it. The invariant the old
-- constraint protected is unchanged in spirit — an event either is on the
-- chapter's calendar or is not, and its stage must say which — the boundary just
-- moved from Planning to Confirmed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programming_event_publish_check') THEN
    ALTER TABLE "ProgrammingEvent"
      ADD CONSTRAINT "programming_event_publish_check"
      CHECK (
        ("stage" IN ('idea', 'planning') AND "calendarEventId" IS NULL)
        OR ("stage" IN ('confirmed', 'done') AND "calendarEventId" IS NOT NULL)
      );
  END IF;
END $$;
