-- Run in Supabase SQL Editor to enable reimbursement receipts.
-- Creates a PRIVATE receipts bucket with NO storage.objects policies.
--
-- Unlike avatars/org-logos, nothing here is readable or writable by anon or
-- authenticated roles: with RLS on storage.objects and no policy naming this
-- bucket, both are denied by default. Every upload and read goes through the app
-- (POST/GET /api/reimbursements/[id]/receipt), which checks that the caller is the
-- requester or holds treasury authority, then talks to Storage with the
-- service-role key (lib/supabase/receipts.ts). Reads are 60-second signed URLs.
--
-- Layout: org-<orgId>/<reimbursementId>-<uuid>.<ext>, so deleteOrg can clear an
-- org's receipts by prefix. The size cap and MIME list mirror lib/supabase/receipts.ts
-- as a second line of defence.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 4194304,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately no `create policy` statements.
