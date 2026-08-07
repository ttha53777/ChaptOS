<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Architecture conventions (Phase 2.5+)

**Route handlers are thin controllers.** Open with `buildContext()` from `@/lib/context`, parse with a Zod schema from `@/lib/validation`, call a service from `@/lib/services`, map errors with `toResponse()` from `@/lib/errors`. No `prisma.*` or `db()` calls in `app/api/**` outside the auth bootstrap routes.

**Side effects flow through events.** Services call `emit(ctx, action, subject, metadata)` from `@/lib/events`. Reactions (recalcs, notifications, projections) live as `on(action, handler)` registrations in `lib/events/handlers/`. Never call another service from inside a service — emit an event.

**Status fields use typed enums.** `@/lib/state` exports unions + guards for every status-bearing String column. DB has CHECK constraints for the stable ones.

**Vocabulary.** DB models keep their existing names (Brother, Organization, Semester). New code MAY use canonical aliases from `@/lib/canonical` (Member, Org, Period) when platform-neutral language matters. Don't rename existing identifiers without a coordinated PR.

**Tenancy.** Every write must go through `ctx.db.<model>` (org-scoped) or carry an explicit `organizationId` in the data. Tenancy tests in `tests/tenancy/` guard this. Postgres RLS is **enforcing** as of Phase 4: `allow_all` permissive policies have been dropped on all org-scoped tables; only `org_isolation` (`organizationId = app.org_id`) remains. `RLS_SET_ORG_ID=1` must be set in every env — `db()` issues `SET LOCAL app.org_id` on every scoped query. Bootstrap paths (request-join, provisionOrg) run as `prismaPrivileged` (BYPASSRLS via `DIRECT_URL`) and are unaffected. To revert RLS to permissive, apply `prisma/migrations/20260622000002_phase4_revert_allow_all/migration.sql` directly.

**`Membership` is the roster row; `Brother` is the shared identity.** One Google account maps to one `Brother` (`authUserId` is globally unique) with many `Membership` rows — one per org. Everything an org assesses about a member lives on the Membership: `name`, `role`, `gpa`, `duesOwed`, `attendance`, `serviceHours`, `archivedAt`, `customFields`, plus `isOrgAdmin`. `Brother` keeps only identity: canonical `name` (a fallback), `email`, `avatarUrl`, `authUserId`, `isGhost`. So the same person can be *Rob* the Treasurer owing $120 in one chapter and *Robert Chen* the plain member owing nothing in another, and neither chapter can read or write the other's row.

Reach the roster through **`ctx.db.member`** (Membership-backed, org-scoped, keyed by `brotherId` — never `Membership.id`, since every child FK and DTO uses `brotherId`). There is deliberately **no `ctx.db.brother`**: scoping a roster read by `Brother.organizationId` is what used to make a multi-org member invisible outside the first org they joined. For the four legitimate cross-org identity writes use **`ctx.db.identity`** (`setEmail`, `setAvatarUrl`, `unlinkAuth`, `setPlatformAdminFlag`) — it has no generic `update()` on purpose.

`Brother.organizationId` survives as an **origin-org hint**. It is still required and still populated, but nothing roster/attendance/dues/reporting-related may scope by it; its only readers are `resolveActiveOrg`'s last-resort default and `deleteOrg`'s re-homing. Making it nullable or dropping it is a separate follow-up.

Two live sharp edges. **Roster writes inside `$transaction` must go through `ctx.db.member.onTx(tx)`** — a hand-written `updateMany({ where: { brotherId } })` that forgets `organizationId` now moves that person's dues in *every* chapter they belong to. And **removing a member from one org is not `DELETE FROM Brother`**: the FK cascades are keyed on `brotherId` with no org filter, so `deleteBrother` checks whether they belong anywhere else and erases only this org's rows when they do.

**Joining is reviewed, and it is the only way onto a roster.** An invite link (`/join/<token>`) is not access — opening one files a `JoinRequest`, and an officer approves or rejects it from the band at the top of `/[slug]/brothers` (gated on `MANAGE_BROTHERS`, badged in the sidebar off `/api/auth/me`). A pending request creates **nothing**: no `Brother`, no `Membership`, nothing an org-scoped query would return, which is why `JoinRequest` carries `authUserId`/`email`/`name` itself. Approval is the single transaction that mints the identity (reusing the existing `Brother` when that Google account already belongs elsewhere), the roster row, an optional `BrotherRole`, and the `InviteRedemption`. The seat check lives there too, so an org at its plan limit can still collect requests and choose whom to make room for.

`JoinRequest` is keyed `@@unique([organizationId, authUserId])` — one row per person per org, reused rather than appended to. That is what makes rejection mean something without a blocklist: a rejected row stays, so re-opening the *same* link is refused, while a *different* link an officer sends resets it to pending. Reloading a dead link can never re-queue someone.

Two things were deleted, not deprecated, because this replaced them. **Officers can no longer type a person onto the roster** — there is no `createBrother`, no `POST /api/brothers`, no add-member form. And the **name-match claim flow is gone** (`/api/auth/claim`, `/pending-access`, `OrgInvite.mode`); it existed only to let someone later take over an officer-typed row. `20260807000001_drop_accountless_members` deleted the rows themselves, so `Brother.authUserId` is now non-null for every roster member in practice. A signed-in stranger on `/[slug]` gets `NeedsInvite`; one with a request pending gets `AwaitingApproval`.

This also closes the duplicate-human gap this file used to flag as unbuilt: there is no longer a pre-made roster row for an existing account to collide with, so nothing needs merging.
