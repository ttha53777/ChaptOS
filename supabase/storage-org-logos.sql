-- Run in Supabase SQL Editor (Storage → Policies) to enable org profile pictures.
-- Creates a public org-logos bucket; users may only write/delete their own folder.
--
-- Authorization note: the per-org "is this user an admin of org N?" check lives
-- in the app (POST/DELETE /api/orgs/logo runs buildContext + a MANAGE_SETTINGS /
-- org-admin gate). Storage RLS only enforces that an uploader writes inside their
-- OWN auth.uid() folder — the same posture as the avatars bucket. Org ownership
-- of a given logo is expressed by Organization.logoUrl pointing at the object,
-- written via lib/supabase/org-logo.ts (the storage helper),
-- exactly as Brother.avatarUrl points at an avatar. This is why a founder's
-- folder may hold logos for several orgs they created, and why deleteOrg removes
-- the specific object the column names rather than wiping the folder.

insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do update set public = true;

create policy "org_logos_public_read"
  on storage.objects for select
  using (bucket_id = 'org-logos');

create policy "org_logos_user_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'org-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "org_logos_user_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'org-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "org_logos_user_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'org-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
