-- One-step turn-on from Settings: an admin asks for the calendar to go live and
-- the worker enables it when the readiness check it settles passes. Cleared on
-- settle (pass or fail) and on disable, so it never outlives one request.
ALTER TABLE "CalendarSubscription" ADD COLUMN "enableOnValidation" BOOLEAN NOT NULL DEFAULT false;
