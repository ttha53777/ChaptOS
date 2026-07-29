-- OrgInvite gains two admin-facing knobs:
--
--   label    an optional name for the link ("Fall rush"). Before this, several
--            active links were distinguishable only by mode + expiry, so an
--            admin could not tell a rush link from an exec-board link.
--   maxUses  an optional redemption cap (NULL = unlimited). Previously a link
--            forwarded out of a group chat worked for anyone until it expired,
--            and the only mitigation was a short expiry.
--
-- The cap is enforced in app/api/auth/redeem-invite (count-then-write), so it is
-- SOFT: concurrent redemptions can exceed it slightly. A hard cap would need a
-- serializable transaction or a counter column; not worth it for an invite link.
-- No CHECK constraint on maxUses for the same reason the app validates it (zod,
-- 1..500) — a DB-level bound would need a migration to change.
--
-- ALTER-only on an existing table, so none of the new-table boilerplate applies:
-- the app-role CRUD grants and the `_id_seq` USAGE grant were already issued by
-- 20260602000000_org_invites (see 20260611000004_programming_app_grants for why
-- the sequence grant matters), and column-level privileges are not in use — a
-- table-level GRANT covers columns added later. The Phase 4 `org_isolation`
-- policy from 20260622000000_phase3_rls_policies is likewise unaffected: it
-- filters on organizationId, which is untouched here.
--
-- Idempotent (IF NOT EXISTS), matching the house style.

ALTER TABLE "OrgInvite" ADD COLUMN IF NOT EXISTS "label"   TEXT;
ALTER TABLE "OrgInvite" ADD COLUMN IF NOT EXISTS "maxUses" INTEGER;
