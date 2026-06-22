<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Architecture conventions (Phase 2.5+)

**Route handlers are thin controllers.** Open with `buildContext()` from `@/lib/context`, parse with a Zod schema from `@/lib/validation`, call a service from `@/lib/services`, map errors with `toResponse()` from `@/lib/errors`. No `prisma.*` or `db()` calls in `app/api/**` outside the auth bootstrap routes.

**Side effects flow through events.** Services call `emit(ctx, action, subject, metadata)` from `@/lib/events`. Reactions (recalcs, notifications, projections) live as `on(action, handler)` registrations in `lib/events/handlers/`. Never call another service from inside a service — emit an event.

**Status fields use typed enums.** `@/lib/state` exports unions + guards for every status-bearing String column. DB has CHECK constraints for the stable ones.

**Vocabulary.** DB models keep their existing names (Brother, Organization, Semester). New code MAY use canonical aliases from `@/lib/canonical` (Member, Org, Period) when platform-neutral language matters. Don't rename existing identifiers without a coordinated PR.

**Tenancy.** Every write must go through `ctx.db.<model>` (org-scoped) or carry an explicit `organizationId` in the data. Tenancy tests in `tests/tenancy/` guard this. Postgres RLS is **enforcing** as of Phase 4: `allow_all` permissive policies have been dropped on all org-scoped tables; only `org_isolation` (`organizationId = app.org_id`) remains. `RLS_SET_ORG_ID=1` must be set in every env — `db()` issues `SET LOCAL app.org_id` on every scoped query. Bootstrap paths (claim, redeem-invite, provisionOrg) run as `prismaPrivileged` (BYPASSRLS via `DIRECT_URL`) and are unaffected. To revert RLS to permissive, apply `prisma/migrations/20260622000002_phase4_revert_allow_all/migration.sql` directly.

**Membership is who belongs to an org; `Brother.organizationId` is the legacy *home* org.** One Google account maps to one `Brother` with many `Membership` rows (one per org); access, admin authority, and org switching all come from `Membership` + `BrotherRole`. Phase 1 (current): roster / attendance / dues / member counts / org reporting still scope by `Brother.organizationId` via `ctx.db`, so a multi-org member appears only in their *home* org's roster even though they can access and administer the others. Phase 2 (future): those features move to `Membership` and `Brother.organizationId` becomes optional/removable. When you mean "members of the current org," reach for `Membership`, not `Brother.organizationId`.
