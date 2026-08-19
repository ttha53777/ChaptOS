-- Per-event field attachment.
--
-- The org's EventFieldDefinition list says which fields exist and which a new
-- event starts with. This column records only where ONE event diverges from that
-- default: the slugs it has opted out of.
--
-- Exceptions rather than a full attachment set, deliberately. Turning a new field
-- on for the chapter then reaches every event that never expressed an opinion,
-- with no backfill; storing "attached" slugs instead would freeze every existing
-- event at whatever the menu looked like the day it was created.
--
-- Defaults to '[]', so every existing row keeps collecting exactly what it
-- collects today. This migration is additive and changes no behaviour on its own.
ALTER TABLE "ProgrammingEvent"
  ADD COLUMN "detachedFields" JSONB NOT NULL DEFAULT '[]';
