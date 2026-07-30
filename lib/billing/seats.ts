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
 * Two queries in parallel, unioned in memory. Deliberately not a clever single
 * SQL statement: org rosters top out in the low hundreds (past 120 an org is
 * talking to sales anyway), and both reads have to go through the org-scoped
 * wrappers so RLS sees `app.org_id`.
 */
export async function countBillableMembers(scoped: ScopedDb): Promise<number> {
  const [homed, memberships] = await Promise.all([
    scoped.brother.findMany({
      where:  { isGhost: false, archivedAt: null },
      select: { id: true },
    }),
    scoped.membership.findMany({
      select: { brotherId: true, brother: { select: { isGhost: true, archivedAt: true } } },
    }),
  ]);

  const ids = new Set<number>(homed.map(b => b.id));

  // A membership whose Brother is homed elsewhere still means a person using
  // this org, so it counts here — but the ghost/archived exclusions have to be
  // re-applied, because the Brother row wasn't filtered by the query above.
  for (const m of memberships) {
    if (m.brother.isGhost) continue;
    if (m.brother.archivedAt !== null) continue;
    ids.add(m.brotherId);
  }

  return ids.size;
}
