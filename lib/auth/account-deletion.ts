/**
 * Self-serve account deletion — a person erasing themselves from ChaptOS.
 *
 * Not a RequestContext path, for the same reason as the join flow: the caller
 * may belong to no org at all (left them all, or only ever filed a request), and
 * the work is cross-org by definition. So it runs on prismaPrivileged, keyed by
 * the verified Supabase account id and nothing the client sends.
 *
 * What one deletion does, in ONE database transaction:
 *
 *   erased    the Brother row, and through the 20260801000000_member_erasure_fks
 *             cascades every Membership and everything hanging off a member in
 *             every org: attendance, excuses, exemptions, dues payments,
 *             reimbursements, poll votes, task assignments/completions, service
 *             participation, metric values, role grants, invite redemptions
 *   erased    every JoinRequest they filed (they carry name + email themselves)
 *   erased    the Supabase login — `auth.users`, whose own FKs take identities,
 *             sessions and refresh tokens with it. Deleted in the same
 *             transaction so there is never a login left pointing at nothing, or
 *             a roster left behind a login that can no longer reach it.
 *   preserved ledger Transactions, ActivityLog, OrgInvite links and programming
 *             events they owned — anonymised by SET NULL, exactly as when an
 *             officer removes a member. The books and the audit trail outlive a
 *             person; their name comes off them.
 *
 * Outside the transaction, best-effort: the uploaded avatar (Storage refuses SQL
 * deletes, so it goes through the API first, while the session still exists),
 * and a seat recount for each org they left.
 *
 * Refusals, decided inside the transaction so a concurrent demotion can't slip
 * past a stale preview:
 *   - a PlatformAdmin grant (PlatformAdmin.brotherId is RESTRICT on purpose)
 *   - being the last admin of any org they belong to
 */

import { createClient } from "@supabase/supabase-js";
import type { Prisma } from "@/app/generated/prisma/client";
import type { AccountDeletionOrg, AccountDeletionPreview } from "@/lib/api-types";
import { prismaPrivileged } from "@/lib/prisma-privileged";
import { db } from "@/lib/db";
import { reconcileSeats } from "@/lib/billing/sync";
import { recordAccountDeletion } from "@/lib/events/bootstrap";
import { ConflictError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { bearerToken } from "./session-user";

const AVATAR_BUCKET = "avatars";

type Client = Prisma.TransactionClient | typeof prismaPrivileged;

interface Assessment {
  brotherId: number | null;
  orgIds:    number[];
  preview:   AccountDeletionPreview;
}

async function assess(p: Client, authUserId: string): Promise<Assessment> {
  const brother = await p.brother.findUnique({
    where:  { authUserId },
    select: {
      id: true,
      platformAdmin: { select: { id: true } },
      memberships: {
        select:  { organizationId: true, isOrgAdmin: true, organization: { select: { name: true, slug: true } } },
        orderBy: { organizationId: "asc" },
      },
    },
  });
  if (!brother) {
    return { brotherId: null, orgIds: [], preview: { canDelete: true, isPlatformAdmin: false, orgs: [] } };
  }

  // Sequential, not Promise.all: a handful of counts, and parallel queries on
  // one transaction client just queue anyway.
  const orgs: AccountDeletionOrg[] = [];
  for (const m of brother.memberships) {
    const others = { organizationId: m.organizationId, brotherId: { not: brother.id } };
    const otherMembers = await p.membership.count({ where: others });
    const otherAdmins = m.isOrgAdmin
      ? await p.membership.count({ where: { ...others, isOrgAdmin: true } })
      : null;
    orgs.push({
      name:       m.organization.name,
      slug:       m.organization.slug,
      blocker:    otherAdmins === 0 ? "last_admin" : null,
      soleMember: otherMembers === 0,
    });
  }

  const isPlatformAdmin = brother.platformAdmin !== null;
  return {
    brotherId: brother.id,
    orgIds:    brother.memberships.map(m => m.organizationId),
    preview:   { canDelete: !isPlatformAdmin && orgs.every(o => o.blocker === null), isPlatformAdmin, orgs },
  };
}

/** What deleting this account would do, and whether anything stops it. Read-only. */
export async function previewAccountDeletion(authUserId: string): Promise<AccountDeletionPreview> {
  return (await assess(prismaPrivileged, authUserId)).preview;
}

function refusal(preview: AccountDeletionPreview): ConflictError {
  if (preview.isPlatformAdmin) {
    return new ConflictError("This account holds a platform-admin grant. Contact support to delete it.", preview);
  }
  const names = preview.orgs.filter(o => o.blocker === "last_admin").map(o => o.name);
  return new ConflictError(
    `You're the last admin of ${names.join(", ")}. Promote another admin or delete the organization first.`,
    preview,
  );
}

/**
 * Permanently delete the signed-in person's account. Idempotent: a retry after
 * a lost response finds no Brother and no login, and succeeds doing nothing.
 */
export async function deleteOwnAccount(authUserId: string): Promise<{ orgIds: number[] }> {
  // Cheap pre-check so a blocked person doesn't lose their avatar for nothing.
  // The transaction below re-decides; this is only about ordering.
  const before = await previewAccountDeletion(authUserId);
  if (!before.canDelete) throw refusal(before);

  await removeAvatarObjects(authUserId);

  const orgIds = await prismaPrivileged.$transaction(async (tx) => {
    const current = await tx.membership.findMany({
      where:  { brother: { authUserId } },
      select: { organizationId: true },
    });
    const ids = current.map(m => m.organizationId);

    // Lock the admin rows of every org involved before counting them, so two
    // co-admins deleting themselves at once can't each see the other as the
    // admin who stays. The loser re-counts after the winner commits.
    if (ids.length > 0) {
      await tx.$queryRaw`SELECT 1 FROM "Membership" WHERE "organizationId" = ANY(${ids}) AND "isOrgAdmin" FOR UPDATE`;
    }

    const { brotherId, preview, orgIds } = await assess(tx, authUserId);
    if (!preview.canDelete) throw refusal(preview);

    await tx.joinRequest.deleteMany({
      where: brotherId === null ? { authUserId } : { OR: [{ authUserId }, { brotherId }] },
    });

    if (brotherId !== null) {
      for (const orgId of orgIds) await recordAccountDeletion(tx, orgId, brotherId);
      await tx.brother.delete({ where: { id: brotherId } });
    }

    await tx.$executeRaw`DELETE FROM auth.users WHERE id = ${authUserId}::uuid`;
    return orgIds;
  });

  // Seats are billed off the roster count; each org just lost one. The billing
  // page reconciles on view too, so a failure here self-heals.
  for (const orgId of orgIds) {
    try {
      await reconcileSeats(db(orgId));
    } catch (e) {
      logError(e, { route: "lib/auth/account-deletion", method: "reconcileSeats", extra: { orgId } });
    }
  }

  return { orgIds };
}

/**
 * Delete everything under avatars/<authUserId>/. Never throws — the account
 * deletion must not hinge on Storage — but logs, because an avatar left behind
 * is a public image of someone who asked to be erased.
 *
 * Prefers the service-role client; without one, uses the caller's own session
 * (cookie for the browser, bearer for the app), which the bucket's policies let
 * delete its own folder — the same thing DELETE /api/auth/avatar relies on.
 */
async function removeAvatarObjects(authUserId: string): Promise<void> {
  try {
    const token = await bearerToken();
    const supabase = getSupabaseAdmin()
      ?? (token
        ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth:   { autoRefreshToken: false, persistSession: false },
          })
        : await createServerSupabaseClient());

    const { data: files, error: listError } = await supabase.storage.from(AVATAR_BUCKET).list(authUserId);
    if (listError) throw listError;
    if (!files?.length) return;

    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(files.map(f => `${authUserId}/${f.name}`));
    if (error) throw error;
  } catch (e) {
    logError(e, { route: "lib/auth/account-deletion", method: "removeAvatarObjects", userId: authUserId });
  }
}
