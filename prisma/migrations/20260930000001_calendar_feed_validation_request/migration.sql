-- Admin-initiated readiness checks (Settings → Calendar subscription). The
-- worker sets validatedAt after a successful full projection, replacing the
-- operator-only `calendar:feeds validate` step.
ALTER TABLE "CalendarSubscription" ADD COLUMN "validationRequestedAt" TIMESTAMP(3);
