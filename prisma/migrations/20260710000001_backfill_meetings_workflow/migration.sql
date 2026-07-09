-- Backfill the new "meetings" workflow onto every existing org.
--
-- Chapter used to be backed by the always-on "operations" workflow, so every org
-- showed it and it could never be hidden. It is now the toggleable "meetings"
-- workflow (see lib/org-types.ts / app/components/Sidebar.tsx NAV_WORKFLOW_MAP).
-- Existing OrganizationConfig rows list their workflows WITHOUT "meetings", so
-- without this backfill every current org would silently lose its Chapter page
-- until an admin re-enabled it. Every org today shows Chapter, so all should keep
-- it: we append "meetings" to any config row that doesn't already have it.
--
-- Idempotent: the NOT (... @> ARRAY['meetings']) guard means re-running is a
-- no-op. Only affects rows missing the id; a config that somehow already lists
-- "meetings" is untouched. New orgs get "meetings" from their org-type template
-- at provision time, so this is a one-time catch-up for pre-existing orgs.

UPDATE "OrganizationConfig"
SET "enabledWorkflows" = array_append("enabledWorkflows", 'meetings')
WHERE NOT ("enabledWorkflows" @> ARRAY['meetings']);
