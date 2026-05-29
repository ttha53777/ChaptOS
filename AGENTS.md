<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Architecture conventions (Phase 2.5+)

**Route handlers are thin controllers.** Open with `buildContext()` from `@/lib/context`, parse with a Zod schema from `@/lib/validation`, call a service from `@/lib/services`, map errors with `toResponse()` from `@/lib/errors`. No `prisma.*` or `db()` calls in `app/api/**` outside the auth bootstrap routes.

**Side effects flow through events.** Services call `emit(ctx, action, subject, metadata)` from `@/lib/events`. Reactions (recalcs, notifications, projections) live as `on(action, handler)` registrations in `lib/events/handlers/`. Never call another service from inside a service — emit an event.

**Status fields use typed enums.** `@/lib/state` exports unions + guards for every status-bearing String column. DB has CHECK constraints for the stable ones.

**Vocabulary.** DB models keep their existing names (Brother, Organization, Semester). New code MAY use canonical aliases from `@/lib/canonical` (Member, Org, Period) when platform-neutral language matters. Don't rename existing identifiers without a coordinated PR.

**Tenancy.** Every write must go through `ctx.db.<model>` (org-scoped) or carry an explicit `organizationId` in the data. Tenancy tests in `tests/tenancy/` guard this. Postgres RLS is enabled but currently permissive; enforcing policies flip during Phase 2.5 rollout.
