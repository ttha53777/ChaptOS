/**
 * Who a push goes to. Every read is org-scoped (ctx.db), so a recipient list can
 * only ever hold this org's members: an org-A event cannot reach someone who is
 * only in org B. Archived members and legacy ghosts are never included.
 */
import type { RequestContext } from "@/lib/context";
import { getActiveSemester } from "@/lib/attendance";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { ExcuseStatus } from "@/lib/state";

export function activeRoster(ctx: RequestContext): Promise<number[]> {
  return ctx.db.member.listIds({ archivedAt: null });
}

/** Current holders of these roles, on the active roster. */
export async function roleHolders(ctx: RequestContext, roleIds: number[]): Promise<number[]> {
  if (roleIds.length === 0) return [];
  const [rows, active] = await Promise.all([
    ctx.db.brotherRole.findMany({ where: { roleId: { in: roleIds } }, select: { brotherId: true } }),
    activeRoster(ctx),
  ]);
  const on = new Set(active);
  return [...new Set(rows.map(r => r.brotherId))].filter(id => on.has(id));
}

/** Named people (still active) plus whoever holds the named roles. */
export async function assigneesOf(ctx: RequestContext, a: { brotherIds: number[]; roleIds: number[] }): Promise<number[]> {
  const [active, holders] = await Promise.all([activeRoster(ctx), roleHolders(ctx, a.roleIds)]);
  const on = new Set(active);
  return [...new Set([...a.brotherIds.filter(id => on.has(id)), ...holders])];
}

/**
 * Who's expected at a check-in: the active roster, minus anyone exempt this
 * semester, anyone with an approved excuse for the event, and anyone already
 * marked present.
 */
export async function expectedAtCheckIn(ctx: RequestContext, calendarEventId: number): Promise<number[]> {
  const semester = await getActiveSemester(ctx.db);
  const [roster, exemptions, excuses, present] = await Promise.all([
    activeRoster(ctx),
    semester ? ctx.db.attendanceExemption.findMany({ where: { semesterId: semester.id }, select: { brotherId: true } }) : [],
    ctx.db.attendanceExcuse.findMany({ where: { calendarEventId, status: ExcuseStatus.Approved }, select: { brotherId: true } }),
    ctx.db.attendanceRecord.findMany({ where: { calendarEventId, attended: true }, select: { brotherId: true } }),
  ]);
  const out = new Set([...exemptions, ...excuses, ...present].map(r => r.brotherId));
  return roster.filter(id => !out.has(id));
}

/** Active members who hold a permission: org admins plus holders of a role carrying the bit. */
export async function holdersOf(ctx: RequestContext, perm: Permission): Promise<number[]> {
  const bit = PERMISSIONS[perm];
  const [admins, roles, active] = await Promise.all([
    ctx.db.member.listIds({ archivedAt: null, isOrgAdmin: true }),
    ctx.db.role.findMany({ select: { id: true, permissions: true } }),
    activeRoster(ctx),
  ]);
  const granting = roles.filter(r => (r.permissions & bit) !== 0).map(r => r.id);
  const grants = granting.length ? await ctx.db.brotherRole.findMany({ where: { roleId: { in: granting } } }) : [];
  const on = new Set(active);
  const viaRole = grants.map(r => r.brotherId).filter(id => on.has(id));
  return [...new Set([...admins, ...viaRole])];
}
