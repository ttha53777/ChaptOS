-- Index the frequent `where: { mandatory: true }` (+ organizationId) CalendarEvent
-- lookups used by attendance recording and the AI upcoming-events tools.
--
-- NOTE: plain CREATE INDEX (Prisma default) takes a brief write lock. For a large
-- production CalendarEvent table, run this as CREATE INDEX CONCURRENTLY outside a
-- transaction instead.
CREATE INDEX "CalendarEvent_organizationId_mandatory_date_idx" ON "CalendarEvent"("organizationId", "mandatory", "date");
