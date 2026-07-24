import { PERMISSIONS, type Permission } from "@/lib/permissions";
import type { db } from "@/lib/db";

/** Org-scoped data accessor (same shape as ctx.db). See lib/ai-tools.ts. */
type Scoped = ReturnType<typeof db>;

/**
 * Who holds a permission in this org — shown when a chat proposal is blocked
 * ("Recording a payment requires Manage dues — held by the Treasurer. Ask
 * Jordan P."). Role titles are ordered by rank desc so the most senior holder
 * fronts the copy; memberName is the first non-ghost holder of the
 * highest-ranked holding role.
 */
export interface PermHolders {
  roleTitles: string[];
  memberName?: string;
}

// 5-min per-org+perm cache — same policy as orgThresholds in lib/ai-tools.ts.
// Role/permission edits are rare; a blocked-card hint may lag them by ≤5 min.
const holdersCache = new Map<string, { value: PermHolders; expires: number }>();

export async function findPermHolders(scoped: Scoped, orgId: number, perm: Permission): Promise<PermHolders> {
  const key = `${orgId}:${perm}`;
  const now = Date.now();
  const cached = holdersCache.get(key);
  if (cached && cached.expires > now) return cached.value;

  const bit = PERMISSIONS[perm];
  let value: PermHolders = { roleTitles: [] };
  try {
    const roles = await scoped.role.findMany({
      orderBy: { rank: "desc" },
      include: {
        brothers: { include: { brother: { select: { name: true, isGhost: true } } } },
      },
    });
    const holding = roles.filter(r => (r.permissions & bit) !== 0);
    const memberName = holding
      .flatMap(r => r.brothers.map(br => br.brother))
      .find(b => !b.isGhost)?.name;
    value = {
      roleTitles: holding.map(r => r.name),
      ...(memberName ? { memberName } : {}),
    };
  } catch {
    /* fail quiet — the gate copy degrades to naming just the permission */
  }
  holdersCache.set(key, { value, expires: now + 5 * 60 * 1000 });
  return value;
}
