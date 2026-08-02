import type { Prisma } from "@/app/generated/prisma/client";
import { assertSeatAvailable } from "@/lib/billing/guard";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError, PaymentRequiredError, type PaymentRequiredDetails } from "@/lib/errors";
import type { CreateBrotherInput, UpdateBrotherInput } from "@/lib/validation/brother";
import {
  sanitizeCustomFields,
  type CustomMemberFieldDef,
  type CustomFieldValues,
} from "@/lib/custom-member-fields";

/**
 * The seat gate, plus the record that it fired.
 *
 * assertSeatAvailable lives in lib/billing/guard.ts, which takes a ScopedDb
 * rather than a RequestContext — it is shared with the pre-auth invite path, and
 * services may not import services — so it has no way to call emit(). The emit
 * has to happen at a call site that has a context, which is here.
 *
 * Rethrows untouched: the 402 body and every caller behave exactly as before.
 * Unlike most billing events this one is deliberately member-visible (no
 * `activity: false`) — it is the direct consequence of something an admin just
 * tried to do, and it needs to be explicable afterwards. See lib/events/actions.ts.
 */
async function gateSeat(ctx: RequestContext): Promise<void> {
  try {
    await assertSeatAvailable(ctx.db);
  } catch (e) {
    if (e instanceof PaymentRequiredError) {
      const details = e.details as PaymentRequiredDetails;
      await emit(ctx, "billing.seats_blocked", { type: "Subscription", id: ctx.orgId }, {
        members:      details.currentMembers,
        requiredTier: details.requiredTier,
        action:       details.action,
      });
    }
    throw e;
  }
}

/** Fetch the org's current custom field definitions from config (server-side only). */
async function getFieldDefs(ctx: RequestContext): Promise<CustomMemberFieldDef[]> {
  const config = await ctx.db.organizationConfig.find();
  if (!config) return [];
  const raw = config.customMemberFields;
  return Array.isArray(raw) ? (raw as unknown as CustomMemberFieldDef[]) : [];
}

export async function listVisibleBrothers(ctx: RequestContext) {
  // Excludes legacy `isGhost` rows. Nothing can create one any more (the claim-
  // flow backdoor that minted them is gone), but pre-existing rows keep read
  // access and must stay out of the roster and every figure derived from it —
  // they have no attendance/dues/GPA history to contribute. listOffRosterMembers
  // is where an admin sees that such an account exists at all.
  //
  // Explicit select, not a bare findMany: this endpoint is fetched on EVERY page
  // for EVERY user (ChapterContext's ALWAYS_SECTIONS), so anything selected here
  // is shipped to every member. `email`, `isAdmin`, `organizationId`, `archivedAt`
  // and `isGhost` used to ride along despite appearing nowhere in the client's
  // `Brother` type (app/data.ts) — pure over-fetch of member PII. Add a field here
  // only if the client actually reads it.
  //
  // `authUserId` is deliberately kept: hydrateBrotherAvatars() keys on it, and
  // publicBrother() strips it before the response is serialized.
  const brothers = await ctx.db.brother.findMany({
    where:   { isGhost: false },
    orderBy: { id: "asc" },
    select: {
      id: true, name: true, role: true, attendance: true, duesOwed: true,
      gpa: true, serviceHours: true, avatarUrl: true, customFields: true,
      authUserId: true,
    },
  });
  const brotherIds = brothers.map(b => b.id);
  // Scope role assignments to the active org. A multi-org member has BrotherRole
  // rows in several orgs; without the org-scoped wrapper's filter another org's
  // roles leak into this org's UI as chips that can't be revoked here (the revoke
  // path is org-scoped, so deleting a foreign-org role 404s / no-ops and the chip
  // reappears on reload). ctx.db injects organizationId: ctx.orgId automatically.
  const brotherRoles = await ctx.db.brotherRole.listWithRole(brotherIds);
  const rolesByBrotherId = new Map<number, { id: number; name: string; color: string | null; rank: number }[]>();
  for (const br of brotherRoles) {
    const list = rolesByBrotherId.get(br.brotherId) ?? [];
    list.push(br.role);
    rolesByBrotherId.set(br.brotherId, list);
  }

  // Fetch field definitions once for the whole list — avoids N+1.
  const defs = await getFieldDefs(ctx);

  // Per-org display names. A person is one Brother but many Memberships, so the
  // name shown on THIS org's roster is their Membership.name here, falling back
  // to the account-level Brother.name when they never set one. Roster-only
  // members (added by an admin, no auth account) have no Membership row and so
  // always fall back. One org-scoped query for the whole list — no N+1.
  const overrides = await ctx.db.membership.findMany({
    where:  { brotherId: { in: brotherIds }, name: { not: null } },
    select: { brotherId: true, name: true },
  });
  const nameByBrotherId = new Map(overrides.map(m => [m.brotherId, m.name!]));

  return brothers.map(b => ({
    ...b,
    name: nameByBrotherId.get(b.id) ?? b.name,
    // Strip unknown / deleted field ids on read so the client never sees orphan values.
    customFields: sanitizeCustomFields(b.customFields, defs),
    roles: (rolesByBrotherId.get(b.id) ?? []).sort((a, z) => z.rank - a.rank),
  }));
}

/**
 * Why someone has access to this org without appearing on its roster.
 *
 *   "invite" — their home org is elsewhere, so Phase 1 roster reads miss them.
 *   "hidden" — a legacy `isGhost` account (see listOffRosterMembers).
 */
export type OffRosterReason = "invite" | "hidden";

/** Someone with access to this org who will never appear on its roster. */
export interface OffRosterMember {
  brotherId: number;
  name:      string;
  email:     string | null;
  joinedAt:  string;
  reason:    OffRosterReason;
}

/**
 * Everyone who can read this org but is absent from its roster. Two disjoint
 * groups, each invisible to listVisibleBrothers for a different reason.
 *
 * **"invite"** — members whose home org is elsewhere (Brother.organizationId ≠
 * ctx.orgId). This is the visible half of a real gap: a Google account maps to
 * ONE Brother globally, so when someone who already belongs to another org
 * redeems an open invite here, redeem-invite gives them a Membership and reuses
 * their existing Brother row. They get access, they can sign in, they show up in
 * chat and tasks — but listVisibleBrothers scopes by Brother.organizationId, so
 * the admin who sent the link sees nothing happen. Silent. The real fix is
 * Phase 2 (roster reads move to Membership) — see AGENTS.md.
 *
 * **"hidden"** — legacy `isGhost` accounts. These were provisioned by a claim-
 * flow backdoor (typing the name "Atomic Samurai") that granted full member-level
 * read access while being filtered out of every listing, count, attendance roll
 * and billing seat. The backdoor is GONE — nothing can mint one of these any
 * more — but rows created before its removal still carry access, and until this
 * query included them there was no surface anywhere in the product that revealed
 * their existence to the admins whose data they can read. Reporting them here is
 * what makes the removal complete: an admin can now see the account and revoke it.
 *
 * Kept deliberately SEPARATE from listVisibleBrothers rather than unioned in:
 * these people have no roster row, so they have no attendance, dues, GPA, or
 * service figures, and folding them into brotherList would corrupt every KPI
 * and every roster-driven recalc that assumes those columns exist. The roster
 * page renders this as an explanatory callout instead.
 */
export async function listOffRosterMembers(ctx: RequestContext): Promise<OffRosterMember[]> {
  const memberships = await ctx.db.membership.findMany({
    where: {
      brother: {
        is: {
          OR: [
            { organizationId: { not: ctx.orgId }, isGhost: false },
            { isGhost: true },
          ],
        },
      },
    },
    select: {
      brotherId: true,
      name:      true,
      joinedAt:  true,
      brother:   { select: { name: true, email: true, isGhost: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  return memberships.map(m => ({
    brotherId: m.brotherId,
    name:      m.name ?? m.brother.name,
    email:     m.brother.email,
    joinedAt:  m.joinedAt.toISOString(),
    reason:    m.brother.isGhost ? "hidden" : "invite",
  }));
}

export async function createBrother(ctx: RequestContext, input: CreateBrotherInput) {
  // Seat gate. Throws PaymentRequiredError (402) when this member would push the
  // org into a price band it isn't covering — the one place platform billing
  // touches a domain write, and deliberately the only kind of restriction there
  // is: nothing the org already has is ever taken away.
  await gateSeat(ctx);

  let customFields: CustomFieldValues = {};
  if (input.customFields) {
    const defs = await getFieldDefs(ctx);
    customFields = sanitizeCustomFields(input.customFields, defs);
  }

  const brother = await ctx.db.brother.create({
    data: {
      name:         input.name,
      role:         input.role,
      attendance:   0,
      duesOwed:     input.duesOwed,
      gpa:          input.gpa,
      serviceHours: input.serviceHours,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customFields: customFields as any,
    },
  });
  await emit(ctx, "brother.added", { type: "Brother", id: brother.id }, {
    name: brother.name,
    role: brother.role,
  });
  return brother;
}

export async function updateBrother(
  ctx: RequestContext,
  brotherId: number,
  input: UpdateBrotherInput,
) {
  // `duesOwed` is deliberately absent, for everyone including admins. It is a money
  // balance mirrored by the Transaction ledger, so it cannot be a field you overwrite:
  // a raw write moves one book and not the other, which is exactly how the roster came
  // to say members were square while the ledger said the chapter had collected nothing.
  // It moves only via lib/services/dues-service.ts — recordDuesPayment (which mints the
  // matching income row atomically) or adjustDues (a reasoned, audited charge/waiver).
  //
  // `name` is handled separately below — it lands on Membership.name (the per-org
  // display name), not on the Brother row.
  const allowed = ["role", "gpa", "serviceHours"] as const;

  const data: Prisma.BrotherUpdateInput = {};
  const changedFields: string[] = [];
  for (const key of allowed) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[key] = value;
    changedFields.push(key);
  }

  // Custom fields: allowed for both admins and self-edit.
  // Definitions are always fetched server-side — the client never influences
  // which fields are valid, only the values.
  if (input.customFields !== undefined) {
    const defs = await getFieldDefs(ctx);
    const sanitized = sanitizeCustomFields(input.customFields, defs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any).customFields = sanitized;
    changedFields.push("customFields");
  }

  // Archive / restore. This is how an org sheds graduated seniors without
  // destroying their history: the row and every attendance, dues and metric
  // record attached to it survive untouched, but the member stops counting
  // toward the billable headcount (lib/billing/seats.ts).
  //
  // "archivedAt" in changedFields is what the seat-sync event handler keys on to
  // trigger a recount — see lib/events/handlers/sync-seats.ts.
  if (input.archived !== undefined) {
    if (input.archived === false) {
      // Restoring adds a billable seat back, so it goes through the same gate as
      // adding a new member. Guarded on the member actually being archived today:
      // a no-op restore of an active member must not be able to 402.
      const current = await ctx.db.brother.findUnique({
        where:  { id: brotherId },
        select: { archivedAt: true },
      });
      if (current?.archivedAt) await gateSeat(ctx);
    }
    data.archivedAt = input.archived ? new Date() : null;
    changedFields.push("archivedAt");
  }

  // The name is an ORG-LOCAL identity: it lands on this org's Membership row, so
  // renaming yourself here never touches what another org calls you. setName is
  // an updateMany, so a target with no Membership in this org — a roster-only
  // member an admin added, who has no auth account and so never joined — reports
  // count 0, and we fall back to the account-level Brother.name. That's the same
  // row listVisibleBrothers falls back to for them, so the roster stays correct.
  let namedViaMembership = false;
  if (input.name !== undefined) {
    const { count } = await ctx.db.membership.setName(brotherId, input.name);
    namedViaMembership = count > 0;
    if (!namedViaMembership) data.name = input.name;
    changedFields.push("name");
  }

  // ctx.db.brother is scoped by Brother.organizationId — the legacy HOME org (see
  // AGENTS.md, Phase 1). A multi-org member's Brother row lives in their home org,
  // so this update throws P2025 in any of their OTHER orgs. That's correct for the
  // Brother-owned columns (an org may only edit the dues/GPA of its own members —
  // the pre-existing Phase 1 rule), but a per-org rename is legitimately this org's
  // business: it already landed on the Membership above and needs nothing from the
  // Brother row. So when the name was the only change, skip the home-org-scoped
  // write rather than 404 a rename that already succeeded.
  //
  // The read-back still goes through an org-scoped delegate: the membership we just
  // wrote proves this brother belongs to THIS org, so it's the tenancy-safe way to
  // resolve the row without loosening scopedBrother's home-org filter.
  let brother;
  if (Object.keys(data).length > 0) {
    brother = await ctx.db.brother.update({ where: { id: brotherId }, data });
  } else {
    const m = await ctx.db.membership.findFirst({
      where:  { brotherId },
      select: { brother: true },
    });
    if (!m) throw new NotFoundError("Brother");
    brother = m.brother;
  }

  // brother.name is the ACCOUNT-level name, which a per-org rename leaves
  // untouched — returning it raw would hand the client the stale name it just
  // renamed away from, and report the stale one in the feed even for an edit
  // that never touched the name (e.g. "Admin updated Thalha's duesOwed" for
  // someone this org calls "Rob"). Resolve the org-local name instead, so the
  // PATCH response matches what GET /api/brothers serves for the same row.
  const nameByBrotherId = await ctx.db.membership.resolveNames([{ id: brother.id, name: brother.name }]);
  const displayName = nameByBrotherId.get(brother.id) ?? brother.name;

  await emit(ctx, "brother.updated", { type: "Brother", id: brother.id }, {
    name: displayName,
    changedFields,
  });
  return { ...brother, name: displayName };
}

/**
 * Hard-delete a member and everything the schema says belongs to them.
 *
 * This is a real erasure, not an archive. The dependent rows go with the member
 * by referential action rather than by application code, because `ctx.db` has no
 * transaction primitive (see doc-folder-service.ts) and a multi-statement cleanup
 * could half-fail — leaving someone whose attendance had been wiped but who still
 * exists. One DELETE, one transaction, enforced by Postgres:
 *
 *   erased    attendance records + excuses + exemptions, dues payments,
 *             reimbursements, poll votes/assignments, task assignments, service
 *             participation, metric values, role grants, memberships, redemptions
 *   preserved ledger Transactions and ActivityLog entries, with the actor
 *             anonymised (SET NULL) — the books and the audit trail must survive
 *             a member leaving
 *   preserved OrgInvite links they created, creator anonymised (SET NULL)
 *
 * Callers who want the member off the roster while KEEPING their history should
 * archive instead (`updateBrother` with `archived: true`), which also releases the
 * billing seat. Deletion is for erasure requests and mistaken entries.
 *
 * Two refusals, both raised up front with a reason rather than surfacing as an
 * opaque FK violation from the database:
 */
export async function deleteBrother(ctx: RequestContext, brotherId: number) {
  const target = await ctx.db.brother.findUnique({
    where: { id: brotherId },
    select: { name: true, isAdmin: true },
  });
  if (!target) throw new NotFoundError("Brother");

  if (target.isAdmin) {
    const adminCount = await ctx.db.brother.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      throw new ConflictError("Cannot delete the last admin. Promote another brother first.");
    }
  }

  // PlatformAdmin.brotherId is deliberately still ON DELETE RESTRICT: revoking
  // someone's platform-staff grant should never be a side effect of an org admin
  // tidying a roster. Check it here so the caller gets a reason instead of the
  // 409 "Foreign key constraint" the raw constraint would produce. Not org-scoped
  // (PlatformAdmin is platform-level, and ctx.db exposes it raw on purpose).
  const platformGrant = await ctx.db.platformAdmin.findUnique({
    where:  { brotherId },
    select: { id: true },
  });
  if (platformGrant) {
    throw new ConflictError(
      "This account holds a platform-admin grant and can't be removed from a roster. Contact support.",
    );
  }

  await ctx.db.brother.delete({ where: { id: brotherId } });
  await emit(ctx, "brother.removed", { type: "Brother", id: brotherId }, { name: target.name });
}
