-- Add custom member field support: definitions on OrganizationConfig, values on Brother.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- Org admins need to capture org-specific member data that the fixed Brother
-- schema can't hold: jersey numbers, majors, pledge classes, instruments,
-- graduation years, sections. Rather than adding ad-hoc columns or a join table,
-- we follow the existing thresholds / vocabularyOverrides pattern — a JSON column
-- on OrganizationConfig for *definitions* and a JSON column on Brother for
-- per-member *values*.
--
-- OrganizationConfig.customMemberFields — JSON array of field descriptor objects,
-- one per org-defined field. Shape:
--   [{ id, label, type, required, showOnRoster, rosterOrder, placeholder?, options? }, ...]
-- The full schema is enforced by lib/custom-member-fields.ts + the Zod schema in
-- lib/validation/org.ts. Empty [] (the default) means no custom fields — the
-- roster and drawer render identically to today.
--
-- Brother.customFields — sparse JSON object keyed by field id. Shape:
--   { "pledge_class": "Spring 2024", "jersey_number": 42, ... }
-- Unknown keys (field deleted from definitions) are stripped on every read and
-- write by sanitizeCustomFields() in lib/custom-member-fields.ts — values are
-- never deleted from the DB itself, which avoids a costly UPDATE-per-delete and
-- lets admins recover data if a field is accidentally removed.
--
-- No new sequences are created (columns added to existing tables), so no
-- additional GRANT on the figurints_app role is needed.
--
-- Idempotent (IF NOT EXISTS) to match this repo's migration convention.

ALTER TABLE "OrganizationConfig"
  ADD COLUMN IF NOT EXISTS "customMemberFields" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "Brother"
  ADD COLUMN IF NOT EXISTS "customFields" JSONB NOT NULL DEFAULT '{}';
