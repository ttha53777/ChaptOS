-- "More details" on calendar events. Additive only: two nullable JSONB columns.
-- CalendarEvent.details holds the event's typed details; CalendarEventType
-- .detailTemplate holds the blank set a new event of that type opens with.
ALTER TABLE "CalendarEvent" ADD COLUMN "details" JSONB;
ALTER TABLE "CalendarEventType" ADD COLUMN "detailTemplate" JSONB;
