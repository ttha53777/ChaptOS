-- Run in the Supabase SQL Editor AFTER migration 20261109000001_chat_attachments.
-- Optional: schedules an hourly delete of expired Ask Chapt attachments.
--
-- Not required for privacy: every app read filters "expiresAt" > now(), so a file
-- is unreachable the moment it expires, and each upload also purges its own org's
-- expired rows. This only reclaims the space for orgs that stop uploading.
-- scripts/purge-chat-attachments.ts does the same thing by hand.
--
-- pg_cron runs as the database owner (BYPASSRLS), so the delete sees every org.

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'purge-chat-attachments';

select cron.schedule(
  'purge-chat-attachments',
  '17 * * * *',
  $$delete from "ChatAttachment" where "expiresAt" <= now()$$
);
