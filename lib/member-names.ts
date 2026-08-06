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
  // findRosterRow is org-scoped and already resolves the org-local name, so
  // this is one query and the null is a real "not a member here".
  const member = await scoped.member.findRosterRow(brotherId);
  return member?.name ?? null;
}
