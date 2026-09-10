-- Apply after the additive Prisma migration, as the database administrator.
-- The function deliberately exposes one boolean, not roster data. It does not
-- rely on app.org_id: Supabase Realtime does not set that application variable.
-- Audit other realtime.messages policies before enabling the pilot: permissive
-- policies combine with OR. Never expose a service-role key in the browser.
BEGIN;
CREATE OR REPLACE FUNCTION public.can_collaborate_meeting_notes(topic text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  parts text[];
  org_id integer;
  event_id integer;
BEGIN
  IF auth.uid() IS NULL OR length(topic) > 100 THEN RETURN false; END IF;
  parts := regexp_match(topic, '^notes:v1:org:([1-9][0-9]{0,9}):event:([1-9][0-9]{0,9})$');
  IF parts IS NULL THEN RETURN false; END IF;
  BEGIN
    org_id := parts[1]::integer;
    event_id := parts[2]::integer;
  EXCEPTION WHEN numeric_value_out_of_range THEN RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM public."CalendarEvent" e
    JOIN public."Brother" b ON b."auth_user_id" = auth.uid()::text
    WHERE e.id = event_id AND e."organizationId" = org_id
      AND e.category = 'chapter' AND e."notesDoc" IS NOT NULL
      AND e."notesProtocolVersion" = 1
      AND (
        b."isAdmin" OR EXISTS (SELECT 1 FROM public."PlatformAdmin" pa WHERE pa."brotherId" = b.id)
        OR EXISTS (
          SELECT 1 FROM public."Membership" m
          WHERE m."brotherId" = b.id AND m."organizationId" = org_id
            AND (m."isOrgAdmin" OR EXISTS (
              SELECT 1 FROM public."BrotherRole" br
              JOIN public."Role" r ON r.id = br."roleId" AND r."organizationId" = org_id
              WHERE br."brotherId" = b.id AND br."organizationId" = org_id
                AND (r.permissions & 4) <> 0
            ))
        )
      )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.can_collaborate_meeting_notes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_collaborate_meeting_notes(text) TO authenticated;

DROP POLICY IF EXISTS notes_receive ON realtime.messages;
CREATE POLICY notes_receive ON realtime.messages FOR SELECT TO authenticated
USING (extension = 'broadcast' AND public.can_collaborate_meeting_notes((SELECT realtime.topic())));
DROP POLICY IF EXISTS notes_send ON realtime.messages;
CREATE POLICY notes_send ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (extension = 'broadcast' AND public.can_collaborate_meeting_notes((SELECT realtime.topic())));
COMMIT;

-- No grants on CalendarEvent/Membership are made to authenticated here.
-- Channel permissions are cached; test resubscribe/JWT refresh/expiry and record
-- the actual revocation window before setting COLLABORATIVE_NOTES_REALTIME=1.
