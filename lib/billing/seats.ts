/**
 * How many people an org is billed for.
 *
 * ── Why this isn't just `Brother.count()` ────────────────────────────────────
 *
 * This app has two divergent notions of "member" and neither one alone is the
 * honest answer (see AGENTS.md, "Membership is who belongs to an org"):
 *
 *   Brother.organizationId  the roster. Includes people an admin typed in who
 *                           have never signed in — real managed members, and the
 *                           bulk of the product's value. But it is the *home* org
 *                           only, so a multi-org member is invisible in every org
 *                           but their first.
 *
 *   Membership              who can actually sign in and use this org. Catches
 *                           the multi-org case the roster misses, but an org with
 *                           a 100-person roster and 3 signed-in officers would
 *                           bill for 3.
 *
 * So: the union of both, deduped by brotherId. That is "people this org
 * manages", which is the thing being paid for, and it is not gameable from
 * either direction.
 *
 * Excluded: ghosts (support backdoor accounts, hidden from every count in the
 * app) and archived members (graduated / inactive — see Brother.archivedAt).
 * Archival is what makes seat-based pricing liveable: without it, an org that
 * graduates forty seniors pays for them forever or destroys their history.
 *
 * Not a service — the seat guard has to be callable from brother-service and
 * from the pre-auth bootstrap routes, and services may not import services.
 * Same reasoning as lib/dues.ts.
 */

import type { db } from "@/lib/db";

type ScopedDb = ReturnType<typeof db>;

/**
 * Billable headcount for the org `scoped` is bound to.
 *
 * One count, because a seat IS a roster row and a roster row IS a Membership.
 * This used to be two queries unioned in memory — everyone whose home org was
 * this one, plus everyone holding a membership here — precisely because "member
 * of this org" had two competing definitions and billing had to charge for the
 * union of both. Phase 2 collapsed them, and this collapsed with them.
 *
 * The two exclusions survive: legacy ghost accounts were never billable, and an
 * archived member is how an org stops paying for graduated seniors without
 * destroying their history. Both live on the roster row's relations, so they
 * stay a single WHERE.
 */
export async function countBillableMembers(scoped: ScopedDb): Promise<number> {
  return scoped.member.count({
    where: { archivedAt: null, brother: { is: { isGhost: false } } },
  });
}
