-- The Tasks workflow backfill was added to
-- 20260619000000_add_tasks_supersede_deadlines after that migration had already
-- run in production. Keep applied migration history immutable and ship the data
-- change as this forward-only migration instead.
--
-- Idempotent: only append the workflow key where it is missing.
UPDATE "OrganizationConfig"
SET "enabledWorkflows" = array_append("enabledWorkflows", 'tasks')
WHERE NOT ('tasks' = ANY("enabledWorkflows"));
