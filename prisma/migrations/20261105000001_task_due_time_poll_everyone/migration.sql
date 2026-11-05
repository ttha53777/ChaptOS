-- Due times on tasks, and whole-chapter polls.
--
-- Additive: one nullable column on Task, one defaulted column on Poll, no
-- backfill. Task.dueTime is a 24h "HH:MM" wall-clock time on Task.dueDate (null =
-- any time that day); it means nothing without a date, so the CHECK forbids it
-- on undated tasks. Poll.everyone marks a poll addressed to the whole active
-- roster, resolved at read time (like Task.everyone), so members who join later
-- get the vote too. Existing polls keep their PollAssignment audience.

ALTER TABLE "Task" ADD COLUMN "dueTime" TEXT;
ALTER TABLE "Task" ADD CONSTRAINT "task_due_time_shape"
  CHECK ("dueTime" IS NULL OR ("dueDate" IS NOT NULL AND "dueTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'));

ALTER TABLE "Poll" ADD COLUMN "everyone" BOOLEAN NOT NULL DEFAULT false;
