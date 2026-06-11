-- Add owner/status columns for the Programming (events) workflow page.
ALTER TABLE "CalendarEvent" ADD COLUMN "owner" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CalendarEvent" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Upcoming';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarEvent_status_check') THEN
    ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_status_check"
      CHECK ("status" IN ('Upcoming','Due Soon','Urgent','Complete'));
  END IF;
END $$;
