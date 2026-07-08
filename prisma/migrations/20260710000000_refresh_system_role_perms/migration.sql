-- One-time backfill of stale system-role permission bitfields.
--
-- Role.permissions is written once at seed/create time. Capability bits added to
-- lib/permissions.ts after an org was seeded (MANAGE_DOCS=1<<9, MANAGE_TASKS=1<<12,
-- MANAGE_POLLS=1<<13, etc.) never reached already-seeded system roles, so a
-- non-admin President carried an old bitfield (e.g. 511 = 9 bits) and silently
-- 403'd on the newer features. This catches every existing org up in one pass.
--
-- Values below are the current bits as of lib/permissions.ts (that file stays the
-- authority — do NOT hand-edit these numbers, they're a snapshot for the catch-up):
--   President  = ALL_PERMISSIONS                    = 16383  (all 14 bits)
--   Treasurer  = MANAGE_TREASURY                    = 2
--   Social     = MANAGE_EVENTS | MANAGE_PARTIES     = 12
--   PR         = MANAGE_INSTAGRAM                   = 16
--
-- Only isSystem roles are touched, so a chapter's custom roles are untouched.
-- Matched by name (unique per org). Idempotent: re-running sets the same values.
-- Going forward, instrumentation.ts re-runs the idempotent seed on every boot, so
-- future bit additions self-heal without another migration.

UPDATE "Role" SET "permissions" = 16383 WHERE "isSystem" = true AND "name" = 'President';
UPDATE "Role" SET "permissions" = 2     WHERE "isSystem" = true AND "name" = 'Treasurer';
UPDATE "Role" SET "permissions" = 12    WHERE "isSystem" = true AND "name" = 'Social';
UPDATE "Role" SET "permissions" = 16    WHERE "isSystem" = true AND "name" = 'PR';
