-- Cancelling a live check-in window ("it didn't happen") instead of closing it.
--
-- Additive: two nullable columns on CalendarEvent, no backfill. Cancelling stamps
-- checkInClosedAt as well, so every existing reader sees an ordinary closed
-- window; checkInCancelledRecords holds the event's AttendanceRecord rows that
-- the cancel removed, so an undo can restore them.

ALTER TABLE "CalendarEvent"
  ADD COLUMN "checkInCancelledAt"      TIMESTAMP(3),
  ADD COLUMN "checkInCancelledRecords" JSONB;
