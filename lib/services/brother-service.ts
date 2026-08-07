import type { Prisma } from "@/app/generated/prisma/client";
import { assertSeatAvailable } from "@/lib/billing/guard";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError, PaymentRequiredError, type PaymentRequiredDetails } from "@/lib/errors";
import { prismaPrivileged } from "@/lib/prisma-privileged"; // lint-direct-prisma:ignore cross-org membership count, see countMemberships
import type { UpdateBrotherInput } from "@/lib/validation/brother";
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
  // THE roster read, and it comes off Membership: one row per person per org.
  // It used to come off Brother, scoped by Brother.organizationId — which meant
  // anyone whose account had originated in another chapter was simply absent
  // here, however long they had been a member. listRoster resolves each member's
  // org-local name and returns brotherId as `id`, so every consumer downstream
  // (and every child FK) is unchanged.
  //
  // Excludes legacy `isGhost` rows, which listRoster does by default. Nothing can
  // create one any more (the claim-flow backdoor that minted them is gone), but
  // pre-existing rows keep read access and must stay out of the roster and every
  // figure derived from it. listGhostAccounts is where an admin sees that such an
  // account exists at all.
  //
  // On over-fetch: `email` is deliberately NOT in the roster shape (see
  // ListRosterOptions). This endpoint is fetched on EVERY page for EVERY user
  // via ChapterContext's ALWAYS_SECTIONS, so anything returned here is shipped to
  // every member. Ask for `fields: "contact"` only where email is actually read.
  const roster = await ctx.db.member.listRoster();
  const brotherIds = roster.map(b => b.id);

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

  return roster.map(b => ({
    id:           b.id,
    name:         b.name,
    role:         b.role,
    attendance:   b.attendance,
    duesOwed:     b.duesOwed,
    gpa:          b.gpa,
    serviceHours: b.serviceHours,
    avatarUrl:    b.avatarUrl,
    // `authUserId` is deliberately kept: hydrateBrotherAvatars() keys on it, and
    // publicBrother() strips it before the response is serialized.
    authUserId:   b.authUserId,
    // Strip unknown / deleted field ids on read so the client never sees orphan values.
    customFields: sanitizeCustomFields(b.customFields, defs),
    roles: (rolesByBrotherId.get(b.id) ?? []).sort((a, z) => z.rank - a.rank),
  }));
}

/** A legacy ghost account: full read access to this org, absent from its roster. */
export interface GhostAccount {
  brotherId: number;
  name:      string;
  email:     string | null;
  joinedAt:  string;
}

/**
 * Legacy `isGhost` accounts — people who can read this org but will never appear
 * on its roster.
 *
 * These were provisioned by a claim-flow backdoor (typing the name "Atomic
 * Samurai") that granted full member-level read access while being filtered out
 * of every listing, count, attendance roll and billing seat. The backdoor is
 * GONE — nothing can mint one of these any more — but rows created before its
 * removal still carry access, and until this query existed there was no surface
 * anywhere in the product that revealed them to the admins whose data they can
 * read. Reporting them is what makes the removal complete: an admin can see the
 * account and revoke it.
 *
 * This function used to have a second, larger job: reporting members whose home
 * org was elsewhere, who had access here but no roster row. That group no longer
 * exists — the roster reads from Membership, so joining an org gives you a real
 * roster spot in it. Ghosts are the only remaining case.
 *
 * Kept deliberately SEPARATE from listVisibleBrothers rather than unioned in:
 * these accounts have no roster row, so they have no attendance, dues, GPA or
 * service figures, and folding them into brotherList would corrupt every KPI and
 * every roster-driven recalc that assumes those values exist.
 */
export async function listGhostAccounts(ctx: RequestContext): Promise<GhostAccount[]> {
  const memberships = await ctx.db.member.findMany({
    where:   { brother: { is: { isGhost: true } } },
    select:  {
      brotherId: true,
      name:      true,
      joinedAt:  true,
      brother:   { select: { name: true, email: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  return memberships.map(m => ({
    brotherId: m.brotherId,
    name:      m.name ?? m.brother.name,
    email:     m.brother.email,
    joinedAt:  m.joinedAt.toISOString(),
  }));
}

// createBrother is gone. Officers can no longer type a person onto the roster:
// the only way a Membership is created is approving a JoinRequest, in
// lib/services/join-request-service.ts, which is where the Brother + Membership
// transaction that used to live here now runs.
//
// That capability was the root of three separate defects — the name-match claim
// flow, OrgInvite's claim mode, and the duplicate-human 409 in redeem-invite —
// all of which were removed with it. See
// prisma/migrations/20260807000001_drop_accountless_members.

export async function updateBrother(
  ctx: RequestContext,
  brotherId: number,
  input: UpdateBrotherInput,
) {
  // Every field here lands on the ROSTER ROW — this org's Membership — so an
  // edit made in one chapter never touches what another chapter records about
  // the same person. That includes the name: someone can be "Rob" here and
  // "Robert Chen" there, and both are correct.
  //
  // `duesOwed` is deliberately absent, for everyone including admins. It is a money
  // balance mirrored by the Transaction ledger, so it cannot be a field you overwrite:
  // a raw write moves one book and not the other, which is exactly how the roster came
  // to say members were square while the ledger said the chapter had collected nothing.
  // It moves only via lib/services/dues-service.ts — recordDuesPayment (which mints the
  // matching income row atomically) or adjustDues (a reasoned, audited charge/waiver).
  const allowed = ["name", "role", "gpa", "serviceHours"] as const;

  const data: Prisma.MembershipUpdateInput = {};
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
  // which fields are valid, only the values. Both the definitions and the values
  // are per-org, so two chapters can each define a "Major" without colliding.
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
  // Per-org, like everything else here — graduating out of one chapter leaves
  // the same person active in another.
  //
  // "archivedAt" in changedFields is what the seat-sync event handler keys on to
  // trigger a recount — see lib/events/handlers/sync-seats.ts.
  if (input.archived !== undefined) {
    if (input.archived === false) {
      // Restoring adds a billable seat back, so it goes through the same gate as
      // adding a new member. Guarded on the member actually being archived today:
      // a no-op restore of an active member must not be able to 402.
      const current = await ctx.db.member.findByBrotherId(brotherId);
      if (current?.archivedAt) await gateSeat(ctx);
    }
    data.archivedAt = input.archived ? new Date() : null;
    changedFields.push("archivedAt");
  }

  // One write, org-scoped. Raises P2025 → 404 when this person is not on THIS
  // org's roster, which is now a real "they aren't a member here" rather than
  // the old "their account happens to have originated elsewhere".
  const updated = await ctx.db.member.updateByBrotherId(brotherId, data);
  if (!updated) throw new NotFoundError("Brother");

  const displayName = await resolveMemberName(ctx, brotherId, updated.name);

  await emit(ctx, "brother.updated", { type: "Brother", id: brotherId }, {
    name: displayName,
    changedFields,
  });

  return {
    id:           brotherId,
    name:         displayName,
    role:         updated.role,
    attendance:   updated.attendance,
    duesOwed:     updated.duesOwed,
    gpa:          updated.gpa,
    serviceHours: updated.serviceHours,
    customFields: updated.customFields,
    archivedAt:   updated.archivedAt,
  };
}

/**
 * This org's name for a member: their Membership.name, or the account-level
 * Brother.name when this org never set one. Only needed on the write paths,
 * where the row we just wrote may carry a null name; the read paths get it
 * resolved for free from listRoster.
 */
async function resolveMemberName(
  ctx: RequestContext,
  brotherId: number,
  membershipName: string | null,
): Promise<string> {
  if (membershipName !== null) return membershipName;
  const identity = await ctx.db.identity.findByBrotherId(brotherId);
  return identity?.name ?? "";
}

/**
 * Remove a member from THIS org's roster, erasing everything this org holds
 * about them.
 *
 * This is a real erasure, not an archive. Callers who want the member off the
 * roster while KEEPING their history should archive instead (`updateBrother`
 * with `archived: true`), which also releases the billing seat. Deletion is for
 * erasure requests and mistaken entries.
 *
 * Two shapes, decided by whether this person belongs anywhere else:
 *
 * **Their only org** — delete the Brother row and let the FK cascades from
 * 20260801000000_member_erasure_fks do the rest, in one statement, one
 * transaction, enforced by Postgres:
 *
 *   erased    attendance records + excuses + exemptions, dues payments,
 *             reimbursements, poll votes/assignments, task assignments, service
 *             participation, metric values, role grants, memberships, redemptions
 *   preserved ledger Transactions and ActivityLog entries, with the actor
 *             anonymised (SET NULL) — the books and the audit trail must survive
 *             a member leaving
 *   preserved OrgInvite links they created, creator anonymised (SET NULL)
 *
 * **A member elsewhere too** — the cascades above are keyed on brotherId and
 * carry NO org filter, so deleting the shared identity row to tidy this roster
 * would silently erase the same person's attendance and dues in every other
 * chapter they belong to. So this path deletes only what belongs to THIS org and
 * leaves the Brother row standing. Their other rosters are untouched; here, they
 * are gone.
 *
 * Two refusals, both raised up front with a reason rather than surfacing as an
 * opaque FK violation from the database:
 */
export async function deleteBrother(ctx: RequestContext, brotherId: number) {
  const target = await ctx.db.member.findRosterRow(brotherId, { fields: "contact" });
  if (!target) throw new NotFoundError("Brother");

  // The org's own admins, counted on this roster. isOrgAdmin is per-org, so a
  // multi-org member being an admin somewhere else does not keep this chapter
  // from being left without one.
  if (target.isOrgAdmin) {
    const adminCount = await ctx.db.member.count({ where: { isOrgAdmin: true } });
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

  // Do they belong to any org other than this one? Asked through the privileged
  // client on purpose: the whole question is about orgs the caller cannot see,
  // and an org-scoped count would always answer 1. Only the count crosses the
  // boundary — no other org's data is read.
  const orgCount = await countMemberships(brotherId);

  if (orgCount <= 1) {
    await ctx.db.identity.deleteAccount(brotherId);
  } else {
    await eraseOrgScopedRecords(ctx, brotherId);
    await ctx.db.member.deleteByBrotherId(brotherId);
  }

  await emit(ctx, "brother.removed", { type: "Brother", id: brotherId }, { name: target.name });
}

/**
 * How many orgs this person belongs to, in total.
 *
 * Deliberately privileged and deliberately cross-org: the question deleteBrother
 * needs answered is "does this member exist outside my chapter?", and an
 * org-scoped count structurally cannot answer it — it would return 1 for
 * everyone, which is the answer that erases other chapters' data. Membership is
 * an RLS-enforced table, so the plain app-role client would return 0 here rather
 * than error, which is worse still.
 *
 * Only a COUNT crosses the boundary. No other org's rows are read, and the
 * caller has already proven this person is on their own roster.
 */
async function countMemberships(brotherId: number): Promise<number> {
  return prismaPrivileged.membership.count({ where: { brotherId } }); // lint-direct-prisma:ignore cross-org by design; a count of one member's own memberships
}

/**
 * Erase every row THIS org holds about a member, for the multi-org case where
 * the Brother row (and its cross-org cascades) must survive.
 *
 * Written out rather than delegated to the FKs precisely because the FKs do not
 * know about orgs. Each delete is org-filtered — directly where the table has an
 * organizationId, and through the parent CalendarEvent where it does not
 * (AttendanceRecord and AttendanceExcuse have no org column of their own).
 *
 * Transactions are NOT deleted: the ledger survives a member leaving, exactly as
 * in the single-org path. Their brotherId is nulled so the money stays on the
 * books without still naming someone this org has erased.
 */
async function eraseOrgScopedRecords(ctx: RequestContext, brotherId: number): Promise<void> {
  const orgId = ctx.orgId;
  await ctx.db.$transaction(async (tx) => {
    const inThisOrg = { brotherId, calendarEvent: { organizationId: orgId } };
    await tx.attendanceRecord.deleteMany({ where: inThisOrg });
    await tx.attendanceExcuse.deleteMany({ where: inThisOrg });

    const scoped = { brotherId, organizationId: orgId };
    await tx.attendanceExemption.deleteMany({ where: scoped });
    await tx.duesPayment.deleteMany({ where: scoped });
    await tx.reimbursement.deleteMany({ where: scoped });
    await tx.brotherMetricValue.deleteMany({ where: scoped });
    await tx.serviceParticipation.deleteMany({ where: scoped });
    await tx.pollVote.deleteMany({ where: scoped });
    await tx.pollAssignment.deleteMany({ where: scoped });
    await tx.taskAssignment.deleteMany({ where: scoped });
    await tx.brotherRole.deleteMany({ where: scoped });
    // ChatApproval names the approver, not a member: its FK is approvedById.
    await tx.chatApproval.deleteMany({ where: { approvedById: brotherId, organizationId: orgId } });

    // InviteRedemption has no organizationId of its own — reach the org through
    // the invite it redeemed.
    await tx.inviteRedemption.deleteMany({ where: { brotherId, invite: { organizationId: orgId } } });

    // The books stay; the name comes off them.
    await tx.transaction.updateMany({
      where: { brotherId, organizationId: orgId },
      data:  { brotherId: null },
    });
  });
}
