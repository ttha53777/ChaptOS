-- Structured meeting summary (gist, decisions, owned action items). Nullable;
-- CalendarEvent's existing org_isolation RLS covers the new column.
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "notesSummaryData" JSONB;
