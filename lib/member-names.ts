/**
 * Org-local display names.
 *
 * A person is one Brother but many Memberships, so the name they go by in THIS
 * org is Membership.name, falling back to the account-level Brother.name when
 * they never set one (roster-only members, added by an admin with no auth
 * account, have no Membership row and so always fall back).
 *
 * This is the same rule the roster renders by (lib/services/brother-service.ts:
 * listVisibleBrothers). Anything that writes a name into durable text — a ledger
 * description, an export — must use it too, or the artifact will say something
 * the roster doesn't.
 */
import { db } from "@/lib/db";

/** Org-scoped data accessor (same shape as ctx.db). */
type Scoped = ReturnType<typeof db>;

/**
 * The name one member goes by in this org, or null if they aren't in it.
 *
 * The lookup is org-scoped, so a brotherId from another org resolves to null —
 * callers can use that as a tenancy check.
 */
export async function resolveMemberName(scoped: Scoped, brotherId: number): Promise<string | null> {
  const brother = await scoped.brother.findUnique({
    where:  { id: brotherId },
    select: { id: true, name: true },
  });
  if (!brother) return null;
  const nameByBrotherId = await scoped.membership.resolveNames([brother]);
  return nameByBrotherId.get(brother.id) ?? brother.name;
}
