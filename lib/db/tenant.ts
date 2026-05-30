/**
 * Org-scoped Prisma wrapper.
 *
 * Every method automatically injects `organizationId` into reads and writes so
 * callers never have to remember to include it. This is the single chokepoint
 * where tenancy is enforced in application code (Postgres RLS is the DB-layer
 * backstop added in Phase 1).
 *
 * Usage:
 *   import { db } from "@/lib/db";
 *   const brothers = await db(orgId).brother.findMany({ where: { isGhost: false } });
 *
 * Scoping rules:
 *   - findMany, findFirst, count, updateMany:  org filter injected into WHERE.
 *   - create:                                  organizationId injected into data.
 *   - findUnique:                              converted to findFirst + org filter
 *                                              (findUnique cannot add extra WHERE
 *                                               conditions — only unique fields are
 *                                               allowed — so findFirst is the correct
 *                                               substitution; it returns null on miss).
 *   - update, delete, upsert:                  organizationId injected into WHERE so
 *                                              a cross-org ID is treated as not found
 *                                              (P2025) rather than silently mutating
 *                                              another org's row.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

// ---------------------------------------------------------------------------
// Per-model scoped delegates
// ---------------------------------------------------------------------------

function scopedBrother(orgId: number) {
  type W = Prisma.BrotherWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.BrotherFindManyArgs)   => prisma.brother.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.BrotherFindFirstArgs)  => prisma.brother.findFirst({ ...args, where: org(args?.where) }),
    // findUnique converted to findFirst so we can inject the org filter.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.BrotherFindUniqueArgs)  => prisma.brother.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.BrotherCreateArgs, "data"> & { data: Omit<Prisma.BrotherUncheckedCreateInput, "organizationId"> }) =>
      prisma.brother.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    // update/delete inject orgId so a cross-org id hits P2025 (not found).
    update:     (args: Prisma.BrotherUpdateArgs) =>
      prisma.brother.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    updateMany: (args: Omit<Prisma.BrotherUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.brother.updateMany({ ...args, where: org(args.where) }),
    delete:     (args: Prisma.BrotherDeleteArgs) =>
      prisma.brother.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.BrotherCountArgs)      => prisma.brother.count({ ...args, where: org(args?.where) }),
  };
}

function scopedRole(orgId: number) {
  type W = Prisma.RoleWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.RoleFindManyArgs)      => prisma.role.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.RoleFindFirstArgs)     => prisma.role.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.RoleFindUniqueArgs)     => prisma.role.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.RoleCreateArgs, "data"> & { data: Omit<Prisma.RoleUncheckedCreateInput, "organizationId"> }) =>
      prisma.role.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.RoleUpdateArgs) =>
      prisma.role.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    updateMany: (args: Omit<Prisma.RoleUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.role.updateMany({ ...args, where: org(args.where) }),
    delete:     (args: Prisma.RoleDeleteArgs) =>
      prisma.role.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.RoleCountArgs)         => prisma.role.count({ ...args, where: org(args?.where) }),
  };
}

function scopedSemester(orgId: number) {
  type W = Prisma.SemesterWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.SemesterFindManyArgs)  => prisma.semester.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.SemesterFindFirstArgs) => prisma.semester.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.SemesterFindUniqueArgs) => prisma.semester.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.SemesterCreateArgs, "data"> & { data: Omit<Prisma.SemesterUncheckedCreateInput, "organizationId"> }) =>
      prisma.semester.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.SemesterUpdateArgs) =>
      prisma.semester.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    updateMany: (args: Omit<Prisma.SemesterUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.semester.updateMany({ ...args, where: org(args.where) }),
    delete:     (args: Prisma.SemesterDeleteArgs) =>
      prisma.semester.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.SemesterCountArgs)     => prisma.semester.count({ ...args, where: org(args?.where) }),
  };
}

function scopedCalendarEvent(orgId: number) {
  type W = Prisma.CalendarEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.CalendarEventFindManyArgs)  => prisma.calendarEvent.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.CalendarEventFindFirstArgs) => prisma.calendarEvent.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.CalendarEventFindUniqueArgs) => prisma.calendarEvent.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.CalendarEventCreateArgs, "data"> & { data: Omit<Prisma.CalendarEventUncheckedCreateInput, "organizationId"> }) =>
      prisma.calendarEvent.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.CalendarEventUpdateArgs) =>
      prisma.calendarEvent.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    delete:     (args: Prisma.CalendarEventDeleteArgs) =>
      prisma.calendarEvent.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.CalendarEventCountArgs)     => prisma.calendarEvent.count({ ...args, where: org(args?.where) }),
  };
}

function scopedServiceEvent(orgId: number) {
  type W = Prisma.ServiceEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.ServiceEventFindManyArgs)   => prisma.serviceEvent.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ServiceEventFindFirstArgs)  => prisma.serviceEvent.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.ServiceEventFindUniqueArgs)  => prisma.serviceEvent.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.ServiceEventCreateArgs, "data"> & { data: Omit<Prisma.ServiceEventUncheckedCreateInput, "organizationId"> }) =>
      prisma.serviceEvent.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.ServiceEventUpdateArgs) =>
      prisma.serviceEvent.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    delete:     (args: Prisma.ServiceEventDeleteArgs) =>
      prisma.serviceEvent.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.ServiceEventCountArgs)      => prisma.serviceEvent.count({ ...args, where: org(args?.where) }),
  };
}

function scopedPartyEvent(orgId: number) {
  type W = Prisma.PartyEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.PartyEventFindManyArgs)     => prisma.partyEvent.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.PartyEventFindFirstArgs)    => prisma.partyEvent.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.PartyEventFindUniqueArgs)    => prisma.partyEvent.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.PartyEventCreateArgs, "data"> & { data: Omit<Prisma.PartyEventUncheckedCreateInput, "organizationId"> }) =>
      prisma.partyEvent.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.PartyEventUpdateArgs) =>
      prisma.partyEvent.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    updateMany: (args: Omit<Prisma.PartyEventUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.partyEvent.updateMany({ ...args, where: org(args.where) }),
    delete:     (args: Prisma.PartyEventDeleteArgs) =>
      prisma.partyEvent.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.PartyEventCountArgs)        => prisma.partyEvent.count({ ...args, where: org(args?.where) }),
  };
}

function scopedDeadline(orgId: number) {
  type W = Prisma.DeadlineWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.DeadlineFindManyArgs)       => prisma.deadline.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.DeadlineFindFirstArgs)      => prisma.deadline.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.DeadlineFindUniqueArgs)      => prisma.deadline.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.DeadlineCreateArgs, "data"> & { data: Omit<Prisma.DeadlineUncheckedCreateInput, "organizationId"> }) =>
      prisma.deadline.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.DeadlineUpdateArgs) =>
      prisma.deadline.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    delete:     (args: Prisma.DeadlineDeleteArgs) =>
      prisma.deadline.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.DeadlineCountArgs)          => prisma.deadline.count({ ...args, where: org(args?.where) }),
  };
}

function scopedInstagramTask(orgId: number) {
  type W = Prisma.InstagramTaskWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.InstagramTaskFindManyArgs)  => prisma.instagramTask.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.InstagramTaskFindFirstArgs) => prisma.instagramTask.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.InstagramTaskFindUniqueArgs) => prisma.instagramTask.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.InstagramTaskCreateArgs, "data"> & { data: Omit<Prisma.InstagramTaskUncheckedCreateInput, "organizationId"> }) =>
      prisma.instagramTask.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.InstagramTaskUpdateArgs) =>
      prisma.instagramTask.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    delete:     (args: Prisma.InstagramTaskDeleteArgs) =>
      prisma.instagramTask.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.InstagramTaskCountArgs)     => prisma.instagramTask.count({ ...args, where: org(args?.where) }),
  };
}

function scopedDoc(orgId: number) {
  type W = Prisma.DocWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.DocFindManyArgs)            => prisma.doc.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.DocFindFirstArgs)           => prisma.doc.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.DocFindUniqueArgs)           => prisma.doc.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.DocCreateArgs, "data"> & { data: Omit<Prisma.DocUncheckedCreateInput, "organizationId"> }) =>
      prisma.doc.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.DocUpdateArgs) =>
      prisma.doc.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    delete:     (args: Prisma.DocDeleteArgs) =>
      prisma.doc.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.DocCountArgs)               => prisma.doc.count({ ...args, where: org(args?.where) }),
  };
}

function scopedTransaction(orgId: number) {
  type W = Prisma.TransactionWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.TransactionFindManyArgs)    => prisma.transaction.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.TransactionFindFirstArgs)   => prisma.transaction.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.TransactionFindUniqueArgs)   => prisma.transaction.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.TransactionCreateArgs, "data"> & { data: Omit<Prisma.TransactionUncheckedCreateInput, "organizationId"> }) =>
      prisma.transaction.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.TransactionUpdateArgs) =>
      prisma.transaction.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    updateMany: (args: Omit<Prisma.TransactionUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.transaction.updateMany({ ...args, where: org(args.where) }),
    delete:     (args: Prisma.TransactionDeleteArgs) =>
      prisma.transaction.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.TransactionCountArgs)       => prisma.transaction.count({ ...args, where: org(args?.where) }),
    aggregate:  (args: Omit<Prisma.TransactionAggregateArgs, "where"> & { where?: W }) =>
      prisma.transaction.aggregate({ ...args, where: org(args?.where) }),
  };
}

function scopedBudget(orgId: number) {
  type W = Prisma.BudgetWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.BudgetFindManyArgs)         => prisma.budget.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.BudgetFindFirstArgs)        => prisma.budget.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.BudgetFindUniqueArgs)        => prisma.budget.findFirst({ ...(args as any), where: org(args.where as W) }),
    /** Org-safe findUnique with allocations included. Use instead of raw prisma.budget.findUnique. */
    findUniqueWithAllocations: (semester: string) =>
      prisma.budget.findUnique({
        where: { organizationId_semester: { organizationId: orgId, semester } },
        include: { allocations: true },
      }),
    create:     (args: Omit<Prisma.BudgetCreateArgs, "data"> & { data: Omit<Prisma.BudgetUncheckedCreateInput, "organizationId"> }) =>
      prisma.budget.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.BudgetUpdateArgs) =>
      prisma.budget.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    // upsert: inject orgId into both the lookup (where) and the create branch.
    upsert:     (args: Prisma.BudgetUpsertArgs) =>
      prisma.budget.upsert({
        ...args,
        where:  { ...args.where,  organizationId: orgId } as Prisma.BudgetWhereUniqueInput,
        create: { ...args.create, organizationId: orgId } as Prisma.BudgetUncheckedCreateInput,
      }),
    delete:     (args: Prisma.BudgetDeleteArgs) =>
      prisma.budget.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
    count:      (args?: Prisma.BudgetCountArgs)            => prisma.budget.count({ ...args, where: org(args?.where) }),
  };
}

function scopedActivityLog(orgId: number) {
  type W = Prisma.ActivityLogWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.ActivityLogFindManyArgs)    => prisma.activityLog.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ActivityLogFindFirstArgs)   => prisma.activityLog.findFirst({ ...args, where: org(args?.where) }),
    create:     (args: Omit<Prisma.ActivityLogCreateArgs, "data"> & { data: Omit<Prisma.ActivityLogUncheckedCreateInput, "organizationId"> }) =>
      prisma.activityLog.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    count:      (args?: Prisma.ActivityLogCountArgs)       => prisma.activityLog.count({ ...args, where: org(args?.where) }),
  };
}

function scopedChapterAnnouncement(orgId: number) {
  type W = Prisma.ChapterAnnouncementWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany:   (args?: Prisma.ChapterAnnouncementFindManyArgs)  => prisma.chapterAnnouncement.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ChapterAnnouncementFindFirstArgs) => prisma.chapterAnnouncement.findFirst({ ...args, where: org(args?.where) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: Prisma.ChapterAnnouncementFindUniqueArgs) => prisma.chapterAnnouncement.findFirst({ ...(args as any), where: org(args.where as W) }),
    create:     (args: Omit<Prisma.ChapterAnnouncementCreateArgs, "data"> & { data: Omit<Prisma.ChapterAnnouncementUncheckedCreateInput, "organizationId"> }) =>
      prisma.chapterAnnouncement.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     (args: Prisma.ChapterAnnouncementUpdateArgs) =>
      prisma.chapterAnnouncement.update({ ...args, where: { ...args.where, organizationId: orgId } }),
    // upsert: inject orgId into both the lookup (where) and the create branch.
    upsert:     (args: Prisma.ChapterAnnouncementUpsertArgs) =>
      prisma.chapterAnnouncement.upsert({
        ...args,
        where:  { ...args.where,  organizationId: orgId } as Prisma.ChapterAnnouncementWhereUniqueInput,
        create: { ...args.create, organizationId: orgId } as Prisma.ChapterAnnouncementUncheckedCreateInput,
      }),
    delete:     (args: Prisma.ChapterAnnouncementDeleteArgs) =>
      prisma.chapterAnnouncement.delete({ ...args, where: { ...args.where, organizationId: orgId } }),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function db(orgId: number) {
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

    // Pass-through for join tables and models that don't carry organizationId
    // directly. Safe because they're always reached through a scoped parent.
    brotherRole:         prisma.brotherRole,
    attendanceRecord:    prisma.attendanceRecord,
    attendanceExcuse:    prisma.attendanceExcuse,
    budgetAllocation:    prisma.budgetAllocation,
    membership:          prisma.membership,
    organization:        prisma.organization,
    platformAdmin:       prisma.platformAdmin,

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
        // Use Number() to ensure the value is numeric even under unexpected coercions.
        await tx.$executeRawUnsafe(`SET LOCAL app.org_id = '${Number(orgId)}'`);
        return fn(tx);
      }, opts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any as typeof prisma.$transaction,
  };
}
