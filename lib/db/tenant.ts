/**
 * Org-scoped Prisma wrapper.
 *
 * Every method automatically injects `organizationId` into reads and writes so
 * callers never have to remember to include it. This is the single chokepoint
 * where tenancy is enforced in application code (Postgres RLS is the DB-layer
 * backstop added in Phase 1).
 *
 * Isolation implementation by operation type
 * ──────────────────────────────────────────
 * findMany / findFirst / count / aggregate
 *   Org filter injected via the `org()` helper. WhereInput accepts any field,
 *   so organizationId can be added directly.
 *
 * findUnique
 *   Replaced with findFirst + org filter. Prisma's WhereUniqueInput only
 *   accepts fields covered by declared unique constraints — organizationId
 *   cannot be added without a @@unique([id, organizationId]) constraint on
 *   every model. findFirst accepts WhereInput and returns T | null identically,
 *   so all call sites are unaffected.
 *
 * create
 *   organizationId injected into data.
 *
 * update / delete
 *   Two-phase pattern: verify() calls findFirst with org filter to confirm
 *   ownership and extract the primary key; the mutation then runs against that
 *   verified id. This avoids needing @@unique([id, organizationId]) on every
 *   model and preserves exact return types and P2025 error semantics.
 *
 * updateMany / deleteMany
 *   Org filter injected directly (these accept WhereInput).
 *
 * upsert (Budget, ChapterAnnouncement)
 *   Not wrapped because their unique keys already include organizationId by
 *   schema design (@@unique([organizationId, semester]) and
 *   @@unique([organizationId])). Callers must pass ctx.orgId in the where
 *   clause — this is enforced by Prisma's type system since the compound key
 *   requires it.
 *
 * $transaction
 *   Passes a raw tx client to the callback. The tx client is not wrapped, so
 *   callers inside the callback must ensure the id they operate on was
 *   pre-verified by a scoped findFirst/findUnique before the transaction
 *   started. For updateMany/deleteMany inside a tx, add organizationId:
 *   ctx.orgId to the where clause explicitly.
 *
 * Usage:
 *   import { db } from "@/lib/db";
 *   const brothers = await db(orgId).brother.findMany({ where: { isGhost: false } });
 */

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Internal guard
// ---------------------------------------------------------------------------

/**
 * Throws a Prisma P2025 error — identical to what Prisma raises for update /
 * delete on a non-existent record. toResponse() and all service catch handlers
 * already treat P2025 as a 404, so this maintains exact error semantics.
 *
 * Declared as returning `never` so TypeScript narrows post-guard callers.
 */
function notInOrg(): never {
  throw new Prisma.PrismaClientKnownRequestError(
    "An operation failed because it depends on one or more records that were required but not found.",
    { code: "P2025", clientVersion: Prisma.prismaVersion.client },
  );
}

// ---------------------------------------------------------------------------
// Per-model scoped delegates
// ---------------------------------------------------------------------------

function scopedBrother(orgId: number) {
  type W = Prisma.BrotherWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.BrotherWhereUniqueInput): Promise<number> {
    const row = await prisma.brother.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.BrotherFindManyArgs)  => prisma.brother.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.BrotherFindFirstArgs) => prisma.brother.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.BrotherFindUniqueArgs) => prisma.brother.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.BrotherCreateArgs, "data"> & { data: Omit<Prisma.BrotherUncheckedCreateInput, "organizationId"> }) =>
      prisma.brother.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.BrotherUpdateArgs) =>
      prisma.brother.update({ ...args, where: { id: await verify(args.where) } }),
    updateMany: (args: Omit<Prisma.BrotherUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.brother.updateMany({ ...args, where: org(args.where) }),
    delete:     async (args: Prisma.BrotherDeleteArgs) =>
      prisma.brother.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.BrotherCountArgs)     => prisma.brother.count({ ...args, where: org(args?.where) }),
  };
}

function scopedRole(orgId: number) {
  type W = Prisma.RoleWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.RoleWhereUniqueInput): Promise<number> {
    const row = await prisma.role.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.RoleFindManyArgs)  => prisma.role.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.RoleFindFirstArgs) => prisma.role.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.RoleFindUniqueArgs) => prisma.role.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.RoleCreateArgs, "data"> & { data: Omit<Prisma.RoleUncheckedCreateInput, "organizationId"> }) =>
      prisma.role.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.RoleUpdateArgs) =>
      prisma.role.update({ ...args, where: { id: await verify(args.where) } }),
    updateMany: (args: Omit<Prisma.RoleUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.role.updateMany({ ...args, where: org(args.where) }),
    delete:     async (args: Prisma.RoleDeleteArgs) =>
      prisma.role.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.RoleCountArgs)     => prisma.role.count({ ...args, where: org(args?.where) }),
  };
}

function scopedSemester(orgId: number) {
  type W = Prisma.SemesterWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.SemesterWhereUniqueInput): Promise<number> {
    const row = await prisma.semester.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.SemesterFindManyArgs)  => prisma.semester.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.SemesterFindFirstArgs) => prisma.semester.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.SemesterFindUniqueArgs) => prisma.semester.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.SemesterCreateArgs, "data"> & { data: Omit<Prisma.SemesterUncheckedCreateInput, "organizationId"> }) =>
      prisma.semester.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.SemesterUpdateArgs) =>
      prisma.semester.update({ ...args, where: { id: await verify(args.where) } }),
    updateMany: (args: Omit<Prisma.SemesterUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.semester.updateMany({ ...args, where: org(args.where) }),
    delete:     async (args: Prisma.SemesterDeleteArgs) =>
      prisma.semester.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.SemesterCountArgs)     => prisma.semester.count({ ...args, where: org(args?.where) }),
  };
}

function scopedCalendarEvent(orgId: number) {
  type W = Prisma.CalendarEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.CalendarEventWhereUniqueInput): Promise<number> {
    const row = await prisma.calendarEvent.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.CalendarEventFindManyArgs)  => prisma.calendarEvent.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.CalendarEventFindFirstArgs) => prisma.calendarEvent.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.CalendarEventFindUniqueArgs) => prisma.calendarEvent.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.CalendarEventCreateArgs, "data"> & { data: Omit<Prisma.CalendarEventUncheckedCreateInput, "organizationId"> }) =>
      prisma.calendarEvent.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.CalendarEventUpdateArgs) =>
      prisma.calendarEvent.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.CalendarEventDeleteArgs) =>
      prisma.calendarEvent.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.CalendarEventCountArgs)     => prisma.calendarEvent.count({ ...args, where: org(args?.where) }),
  };
}

function scopedServiceEvent(orgId: number) {
  type W = Prisma.ServiceEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ServiceEventWhereUniqueInput): Promise<number> {
    const row = await prisma.serviceEvent.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ServiceEventFindManyArgs)  => prisma.serviceEvent.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ServiceEventFindFirstArgs) => prisma.serviceEvent.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.ServiceEventFindUniqueArgs) => prisma.serviceEvent.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.ServiceEventCreateArgs, "data"> & { data: Omit<Prisma.ServiceEventUncheckedCreateInput, "organizationId"> }) =>
      prisma.serviceEvent.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.ServiceEventUpdateArgs) =>
      prisma.serviceEvent.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.ServiceEventDeleteArgs) =>
      prisma.serviceEvent.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.ServiceEventCountArgs)     => prisma.serviceEvent.count({ ...args, where: org(args?.where) }),
  };
}

function scopedPartyEvent(orgId: number) {
  type W = Prisma.PartyEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.PartyEventWhereUniqueInput): Promise<number> {
    const row = await prisma.partyEvent.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.PartyEventFindManyArgs)  => prisma.partyEvent.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.PartyEventFindFirstArgs) => prisma.partyEvent.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.PartyEventFindUniqueArgs) => prisma.partyEvent.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.PartyEventCreateArgs, "data"> & { data: Omit<Prisma.PartyEventUncheckedCreateInput, "organizationId"> }) =>
      prisma.partyEvent.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.PartyEventUpdateArgs) =>
      prisma.partyEvent.update({ ...args, where: { id: await verify(args.where) } }),
    updateMany: (args: Omit<Prisma.PartyEventUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.partyEvent.updateMany({ ...args, where: org(args.where) }),
    delete:     async (args: Prisma.PartyEventDeleteArgs) =>
      prisma.partyEvent.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.PartyEventCountArgs)     => prisma.partyEvent.count({ ...args, where: org(args?.where) }),
  };
}

function scopedDeadline(orgId: number) {
  type W = Prisma.DeadlineWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.DeadlineWhereUniqueInput): Promise<number> {
    const row = await prisma.deadline.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.DeadlineFindManyArgs)  => prisma.deadline.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.DeadlineFindFirstArgs) => prisma.deadline.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.DeadlineFindUniqueArgs) => prisma.deadline.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.DeadlineCreateArgs, "data"> & { data: Omit<Prisma.DeadlineUncheckedCreateInput, "organizationId"> }) =>
      prisma.deadline.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.DeadlineUpdateArgs) =>
      prisma.deadline.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.DeadlineDeleteArgs) =>
      prisma.deadline.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.DeadlineCountArgs)     => prisma.deadline.count({ ...args, where: org(args?.where) }),
  };
}

function scopedInstagramTask(orgId: number) {
  type W = Prisma.InstagramTaskWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.InstagramTaskWhereUniqueInput): Promise<number> {
    const row = await prisma.instagramTask.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.InstagramTaskFindManyArgs)  => prisma.instagramTask.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.InstagramTaskFindFirstArgs) => prisma.instagramTask.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.InstagramTaskFindUniqueArgs) => prisma.instagramTask.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.InstagramTaskCreateArgs, "data"> & { data: Omit<Prisma.InstagramTaskUncheckedCreateInput, "organizationId"> }) =>
      prisma.instagramTask.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.InstagramTaskUpdateArgs) =>
      prisma.instagramTask.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.InstagramTaskDeleteArgs) =>
      prisma.instagramTask.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.InstagramTaskCountArgs)     => prisma.instagramTask.count({ ...args, where: org(args?.where) }),
  };
}

function scopedDoc(orgId: number) {
  type W = Prisma.DocWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.DocWhereUniqueInput): Promise<number> {
    const row = await prisma.doc.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.DocFindManyArgs)  => prisma.doc.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.DocFindFirstArgs) => prisma.doc.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.DocFindUniqueArgs) => prisma.doc.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.DocCreateArgs, "data"> & { data: Omit<Prisma.DocUncheckedCreateInput, "organizationId"> }) =>
      prisma.doc.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.DocUpdateArgs) =>
      prisma.doc.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.DocDeleteArgs) =>
      prisma.doc.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.DocCountArgs)     => prisma.doc.count({ ...args, where: org(args?.where) }),
  };
}

function scopedTransaction(orgId: number) {
  type W = Prisma.TransactionWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.TransactionWhereUniqueInput): Promise<number> {
    const row = await prisma.transaction.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.TransactionFindManyArgs)  => prisma.transaction.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.TransactionFindFirstArgs) => prisma.transaction.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.TransactionFindUniqueArgs) => prisma.transaction.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.TransactionCreateArgs, "data"> & { data: Omit<Prisma.TransactionUncheckedCreateInput, "organizationId"> }) =>
      prisma.transaction.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.TransactionUpdateArgs) =>
      prisma.transaction.update({ ...args, where: { id: await verify(args.where) } }),
    updateMany: (args: Omit<Prisma.TransactionUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.transaction.updateMany({ ...args, where: org(args.where) }),
    delete:     async (args: Prisma.TransactionDeleteArgs) =>
      prisma.transaction.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.TransactionCountArgs)     => prisma.transaction.count({ ...args, where: org(args?.where) }),
    aggregate:  (args: Omit<Prisma.TransactionAggregateArgs, "where"> & { where?: W }) =>
      prisma.transaction.aggregate({ ...args, where: org(args?.where) }),
  };
}

function scopedBudget(orgId: number) {
  type W = Prisma.BudgetWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.BudgetWhereUniqueInput): Promise<number> {
    const row = await prisma.budget.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.BudgetFindManyArgs)  => prisma.budget.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.BudgetFindFirstArgs) => prisma.budget.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.BudgetFindUniqueArgs) => prisma.budget.findFirst({ ...args, where: org(args.where as W) }),
    /**
     * Org-safe findUnique with allocations. The @@unique([organizationId, semester])
     * key is already org-scoped. Omits the *Cents BigInt mirror columns: they
     * can't be JSON-serialized (Response.json → JSON.stringify throws on BigInt)
     * and no consumer reads them — `carryoverBalance`/`reserveAmount` (Float)
     * are the values the UI and DTOs use.
     */
    findUniqueWithAllocations: (semester: string) =>
      prisma.budget.findUnique({
        where: { organizationId_semester: { organizationId: orgId, semester } },
        include: { allocations: true },
        omit: { carryoverBalanceCents: true, reserveAmountCents: true },
      }),
    create:     (args: Omit<Prisma.BudgetCreateArgs, "data"> & { data: Omit<Prisma.BudgetUncheckedCreateInput, "organizationId"> }) =>
      prisma.budget.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.BudgetUpdateArgs) =>
      prisma.budget.update({ ...args, where: { id: await verify(args.where) } }),
    /** upsert is safe: @@unique([organizationId, semester]) requires callers to pass ctx.orgId in the where clause. */
    upsert:     (args: Prisma.BudgetUpsertArgs) => prisma.budget.upsert(args),
    delete:     async (args: Prisma.BudgetDeleteArgs) =>
      prisma.budget.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.BudgetCountArgs)     => prisma.budget.count({ ...args, where: org(args?.where) }),
  };
}

function scopedActivityLog(orgId: number) {
  type W = Prisma.ActivityLogWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.ActivityLogFindManyArgs)  => prisma.activityLog.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ActivityLogFindFirstArgs) => prisma.activityLog.findFirst({ ...args, where: org(args?.where) }),
    create:     (args: Omit<Prisma.ActivityLogCreateArgs, "data"> & { data: Omit<Prisma.ActivityLogUncheckedCreateInput, "organizationId"> }) =>
      prisma.activityLog.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    count:      (args?: Prisma.ActivityLogCountArgs)     => prisma.activityLog.count({ ...args, where: org(args?.where) }),
  };
}

function scopedBrotherRole(orgId: number) {
  type W = Prisma.BrotherRoleWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  // BrotherRole PK is (brotherId, roleId). Ownership verification confirms that
  // the row's organizationId matches this context before any mutation.
  async function verifyComposite(brotherId: number, roleId: number): Promise<void> {
    const row = await prisma.brotherRole.findFirst({
      where: { brotherId, roleId, organizationId: orgId },
      select: { brotherId: true },
    });
    if (!row) notInOrg();
  }

  return {
    findMany: (args?: Prisma.BrotherRoleFindManyArgs) =>
      prisma.brotherRole.findMany({ ...args, where: org(args?.where) }),
    count: (args?: Prisma.BrotherRoleCountArgs) =>
      prisma.brotherRole.count({ ...args, where: org(args?.where) }),
    /**
     * Member count per role, batched into ONE groupBy instead of N per-role
     * COUNT() round-trips (the listRoles N+1). Org-scoped exactly like count():
     * the same `organizationId: orgId` filter is injected, so the result is
     * identical to summing per-role counts. Returns a Map(roleId → count);
     * roles with zero members are simply absent (callers default to 0).
     */
    countByRole: async (roleIds: number[]): Promise<Map<number, number>> => {
      if (roleIds.length === 0) return new Map();
      const rows = await prisma.brotherRole.groupBy({
        by: ["roleId"],
        where: org({ roleId: { in: roleIds } }),
        _count: { roleId: true },
      });
      return new Map(rows.map(r => [r.roleId, r._count.roleId]));
    },
    create: (args: Omit<Prisma.BrotherRoleCreateArgs, "data"> & { data: Omit<Prisma.BrotherRoleUncheckedCreateInput, "organizationId"> }) =>
      prisma.brotherRole.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    delete: async (args: Prisma.BrotherRoleDeleteArgs) => {
      const { brotherId, roleId } = (args.where as { brotherId_roleId: { brotherId: number; roleId: number } }).brotherId_roleId;
      await verifyComposite(brotherId, roleId);
      return prisma.brotherRole.delete(args);
    },
  };
}

function scopedChapterAnnouncement(orgId: number) {
  type W = Prisma.ChapterAnnouncementWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ChapterAnnouncementWhereUniqueInput): Promise<number> {
    const row = await prisma.chapterAnnouncement.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ChapterAnnouncementFindManyArgs)  => prisma.chapterAnnouncement.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ChapterAnnouncementFindFirstArgs) => prisma.chapterAnnouncement.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.ChapterAnnouncementFindUniqueArgs) => prisma.chapterAnnouncement.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.ChapterAnnouncementCreateArgs, "data"> & { data: Omit<Prisma.ChapterAnnouncementUncheckedCreateInput, "organizationId"> }) =>
      prisma.chapterAnnouncement.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.ChapterAnnouncementUpdateArgs) =>
      prisma.chapterAnnouncement.update({ ...args, where: { id: await verify(args.where) } }),
    /** upsert is safe: @@unique([organizationId]) is the only valid unique selector, so callers must pass ctx.orgId. */
    upsert:     (args: Prisma.ChapterAnnouncementUpsertArgs) => prisma.chapterAnnouncement.upsert(args),
    delete:     async (args: Prisma.ChapterAnnouncementDeleteArgs) =>
      prisma.chapterAnnouncement.delete({ where: { id: await verify(args.where) } }),
  };
}

function scopedOrgInvite(orgId: number) {
  type W = Prisma.OrgInviteWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.OrgInviteWhereUniqueInput): Promise<number> {
    const row = await prisma.orgInvite.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.OrgInviteFindManyArgs)  => prisma.orgInvite.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.OrgInviteFindFirstArgs) => prisma.orgInvite.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.OrgInviteFindUniqueArgs) => prisma.orgInvite.findFirst({ ...args, where: org(args.where as W) }),
    /**
     * Redemption count per invite, batched into ONE groupBy instead of N
     * per-invite COUNT() round-trips (the listInvites N+1). InviteRedemption has
     * no organizationId column, but the caller passes invite ids it already
     * fetched org-scoped via findMany, so grouping by those ids is equivalent to
     * the per-invite counts. Returns a Map(inviteId → count); invites with zero
     * redemptions are absent (callers default to 0).
     */
    redemptionCountByInvite: async (inviteIds: number[]): Promise<Map<number, number>> => {
      if (inviteIds.length === 0) return new Map();
      const rows = await prisma.inviteRedemption.groupBy({
        by: ["inviteId"],
        where: { inviteId: { in: inviteIds } },
        _count: { inviteId: true },
      });
      return new Map(rows.map(r => [r.inviteId, r._count.inviteId]));
    },
    create:     (args: Omit<Prisma.OrgInviteCreateArgs, "data"> & { data: Omit<Prisma.OrgInviteUncheckedCreateInput, "organizationId"> }) =>
      prisma.orgInvite.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.OrgInviteUpdateArgs) =>
      prisma.orgInvite.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.OrgInviteDeleteArgs) =>
      prisma.orgInvite.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.OrgInviteCountArgs)     => prisma.orgInvite.count({ ...args, where: org(args?.where) }),
  };
}

function scopedOrganizationConfig(orgId: number) {
  // OrganizationConfig has a 1:1 relation to Organization with organizationId
  // @unique, so every operation is selected by organizationId directly — there
  // is exactly one row per org. No id-based verify() dance is needed because
  // organizationId is itself the org-scoping filter AND a valid unique selector.
  return {
    find: () =>
      prisma.organizationConfig.findUnique({ where: { organizationId: orgId } }),
    update: (data: Prisma.OrganizationConfigUpdateInput) =>
      prisma.organizationConfig.update({ where: { organizationId: orgId }, data }),
    /**
     * Create-or-update the single config row for this org. Used so a legacy org
     * whose config row was somehow never provisioned still gets one rather than
     * throwing P2025 on update. organizationId is injected, never taken from the
     * caller, so it can't be spoofed across tenants.
     */
    upsert: (data: { enabledWorkflows?: string[]; vocabularyOverrides?: Record<string, string> }) =>
      prisma.organizationConfig.upsert({
        where:  { organizationId: orgId },
        update: data,
        create: { organizationId: orgId, ...data },
      }),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function db(orgId: number) {
  // Hard gate at the single chokepoint: orgId must be a positive integer. Every
  // scoped delegate injects this value into WHERE/data, and $transaction
  // interpolates it into `SET LOCAL app.org_id`. A non-integer here would either
  // silently mis-scope every query or (for the raw SET LOCAL) be a SQL-injection
  // vector. Today orgId always comes from context as a number, but failing
  // loudly here keeps that invariant from ever being violated by a future caller.
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error(`db(): orgId must be a positive integer, got ${JSON.stringify(orgId)}`);
  }
  return {
    brother:             scopedBrother(orgId),
    role:                scopedRole(orgId),
    semester:            scopedSemester(orgId),
    calendarEvent:       scopedCalendarEvent(orgId),
    serviceEvent:        scopedServiceEvent(orgId),
    partyEvent:          scopedPartyEvent(orgId),
    deadline:            scopedDeadline(orgId),
    instagramTask:       scopedInstagramTask(orgId),
    doc:                 scopedDoc(orgId),
    transaction:         scopedTransaction(orgId),
    budget:              scopedBudget(orgId),
    activityLog:         scopedActivityLog(orgId),
    chapterAnnouncement: scopedChapterAnnouncement(orgId),

    brotherRole:         scopedBrotherRole(orgId),
    orgInvite:           scopedOrgInvite(orgId),
    organizationConfig:  scopedOrganizationConfig(orgId),

    // Pass-through for join tables that have no organizationId column and are
    // always accessed through a verified parent id.
    // AttendanceRecord / AttendanceExcuse: reached via CalendarEvent (org-scoped).
    // BudgetAllocation: reached via Budget (org-scoped).
    // These three are candidates for the next hardening pass.
    attendanceRecord:    prisma.attendanceRecord,
    attendanceExcuse:    prisma.attendanceExcuse,
    budgetAllocation:    prisma.budgetAllocation,
    membership:          prisma.membership,
    organization:        prisma.organization,
    platformAdmin:       prisma.platformAdmin,
    // InviteRedemption has no organizationId column — it's reached via an
    // org-verified OrgInvite (count is per-invite), so it's a pass-through like
    // the attendance join tables above.
    inviteRedemption:    prisma.inviteRedemption,

    // Interactive transaction pass-through. Sets app.org_id via SET LOCAL so
    // Postgres RLS policies can enforce org scoping at the DB layer for the
    // duration of the transaction. Callers inside the callback must still
    // inject organizationId: orgId manually on writes — the tx client itself
    // can't be wrapped without invasive surgery.
    //
    // Note on pgbouncer: SET LOCAL is rolled back at COMMIT, so it stays
    // scoped to this transaction even under transaction-mode pooling.
    $transaction: ((
      fn: Parameters<typeof prisma.$transaction>[0],
      opts?: Parameters<typeof prisma.$transaction>[1],
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return prisma.$transaction(async (tx: any) => {
        // orgId is guaranteed a positive integer by the db() guard above, so
        // this interpolation cannot carry SQL. Re-stringify the integer form
        // explicitly so the safety is local to this line, not action-at-a-distance.
        await tx.$executeRawUnsafe(`SET LOCAL app.org_id = '${Math.trunc(orgId)}'`);
        return fn(tx);
      }, opts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any as typeof prisma.$transaction,
  };
}
