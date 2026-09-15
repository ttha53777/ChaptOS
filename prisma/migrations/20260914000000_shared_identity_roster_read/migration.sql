-- Brother is shared identity. A roster may read identity for its own members
-- even when that identity originated in a different org. This SELECT-only
-- policy does not permit writes to another org's identity or Membership.
DROP POLICY IF EXISTS roster_identity_read ON "Brother";
CREATE POLICY roster_identity_read ON "Brother" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "Membership" m
    WHERE m."brotherId" = "Brother"."id"
      AND m."organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer
  ));
