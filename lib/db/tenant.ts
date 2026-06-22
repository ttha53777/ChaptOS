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

function scopedServiceParticipation(orgId: number) {
  type W = Prisma.ServiceParticipationWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ServiceParticipationWhereUniqueInput): Promise<number> {
    const row = await prisma.serviceParticipation.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ServiceParticipationFindManyArgs)  => prisma.serviceParticipation.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ServiceParticipationFindFirstArgs) => prisma.serviceParticipation.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.ServiceParticipationFindUniqueArgs) => prisma.serviceParticipation.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.ServiceParticipationCreateArgs, "data"> & { data: Omit<Prisma.ServiceParticipationUncheckedCreateInput, "organizationId"> }) =>
      prisma.serviceParticipation.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.ServiceParticipationUpdateArgs) =>
      prisma.serviceParticipation.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.ServiceParticipationDeleteArgs) =>
      prisma.serviceParticipation.delete({ where: { id: await verify(args.where) } }),
    deleteMany: (args?: Omit<Prisma.ServiceParticipationDeleteManyArgs, "where"> & { where?: W }) =>
      prisma.serviceParticipation.deleteMany({ ...args, where: org(args?.where) }),
    count:      (args?: Prisma.ServiceParticipationCountArgs)     => prisma.serviceParticipation.count({ ...args, where: org(args?.where) }),
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

function scopedTask(orgId: number) {
  type W = Prisma.TaskWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.TaskWhereUniqueInput): Promise<number> {
    const row = await prisma.task.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.TaskFindManyArgs)  => prisma.task.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.TaskFindFirstArgs) => prisma.task.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.TaskFindUniqueArgs) => prisma.task.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.TaskCreateArgs, "data"> & { data: Omit<Prisma.TaskUncheckedCreateInput, "organizationId"> }) =>
      prisma.task.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.TaskUpdateArgs) =>
      prisma.task.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.TaskDeleteArgs) =>
      prisma.task.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.TaskCountArgs)     => prisma.task.count({ ...args, where: org(args?.where) }),
  };
}

function scopedTaskAssignment(orgId: number) {
  type W = Prisma.TaskAssignmentWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  return {
    findMany:   (args?: Prisma.TaskAssignmentFindManyArgs) => prisma.taskAssignment.findMany({ ...args, where: org(args?.where) }),
    createMany: (args: { data: Omit<Prisma.TaskAssignmentUncheckedCreateInput, "organizationId">[] }) =>
      prisma.taskAssignment.createMany({ data: args.data.map(d => ({ ...d, organizationId: orgId })) }),
    deleteMany: (args?: Prisma.TaskAssignmentDeleteManyArgs) => prisma.taskAssignment.deleteMany({ ...args, where: org(args?.where) }),
    count:      (args?: Prisma.TaskAssignmentCountArgs)     => prisma.taskAssignment.count({ ...args, where: org(args?.where) }),
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

function scopedProgrammingEvent(orgId: number) {
  type W = Prisma.ProgrammingEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ProgrammingEventWhereUniqueInput): Promise<number> {
    const row = await prisma.programmingEvent.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ProgrammingEventFindManyArgs)  => prisma.programmingEvent.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ProgrammingEventFindFirstArgs) => prisma.programmingEvent.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.ProgrammingEventFindUniqueArgs) => prisma.programmingEvent.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.ProgrammingEventCreateArgs, "data"> & { data: Omit<Prisma.ProgrammingEventUncheckedCreateInput, "organizationId"> }) =>
      prisma.programmingEvent.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.ProgrammingEventUpdateArgs) =>
      prisma.programmingEvent.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.ProgrammingEventDeleteArgs) =>
      prisma.programmingEvent.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.ProgrammingEventCountArgs)     => prisma.programmingEvent.count({ ...args, where: org(args?.where) }),
  };
}

function scopedProgrammingEventDoc(orgId: number) {
  type W = Prisma.ProgrammingEventDocWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ProgrammingEventDocWhereUniqueInput): Promise<number> {
    const row = await prisma.programmingEventDoc.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ProgrammingEventDocFindManyArgs)  => prisma.programmingEventDoc.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ProgrammingEventDocFindFirstArgs) => prisma.programmingEventDoc.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.ProgrammingEventDocFindUniqueArgs) => prisma.programmingEventDoc.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.ProgrammingEventDocCreateArgs, "data"> & { data: Omit<Prisma.ProgrammingEventDocUncheckedCreateInput, "organizationId"> }) =>
      prisma.programmingEventDoc.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    delete:     async (args: Prisma.ProgrammingEventDocDeleteArgs) =>
      prisma.programmingEventDoc.delete({ where: { id: await verify(args.where) } }),
    deleteMany: (args?: Prisma.ProgrammingEventDocDeleteManyArgs) =>
      prisma.programmingEventDoc.deleteMany({ ...args, where: org(args?.where) }),
    count:      (args?: Prisma.ProgrammingEventDocCountArgs)     => prisma.programmingEventDoc.count({ ...args, where: org(args?.where) }),
  };
}

function scopedProgrammingChecklistItem(orgId: number) {
  type W = Prisma.ProgrammingChecklistItemWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ProgrammingChecklistItemWhereUniqueInput): Promise<number> {
    const row = await prisma.programmingChecklistItem.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ProgrammingChecklistItemFindManyArgs)  => prisma.programmingChecklistItem.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ProgrammingChecklistItemFindFirstArgs) => prisma.programmingChecklistItem.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.ProgrammingChecklistItemFindUniqueArgs) => prisma.programmingChecklistItem.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.ProgrammingChecklistItemCreateArgs, "data"> & { data: Omit<Prisma.ProgrammingChecklistItemUncheckedCreateInput, "organizationId"> }) =>
      prisma.programmingChecklistItem.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.ProgrammingChecklistItemUpdateArgs) =>
      prisma.programmingChecklistItem.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.ProgrammingChecklistItemDeleteArgs) =>
      prisma.programmingChecklistItem.delete({ where: { id: await verify(args.where) } }),
    deleteMany: (args?: Prisma.ProgrammingChecklistItemDeleteManyArgs) =>
      prisma.programmingChecklistItem.deleteMany({ ...args, where: org(args?.where) }),
    count:      (args?: Prisma.ProgrammingChecklistItemCountArgs)     => prisma.programmingChecklistItem.count({ ...args, where: org(args?.where) }),
    aggregate:  (args: Omit<Prisma.ProgrammingChecklistItemAggregateArgs, "where"> & { where?: W }) =>
      prisma.programmingChecklistItem.aggregate({ ...args, where: org(args?.where) }),
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
    /**
     * Role assignments (with role summary) for a set of brothers in this org.
     * Named method because the wrapper's findMany signature is not generic, so
     * a relation `select` wouldn't narrow the return type. Same org filter as
     * findMany — organizationId is injected, never taken from the caller.
     */
    listWithRole: (brotherIds: number[]) =>
      prisma.brotherRole.findMany({
        where: org({ brotherId: { in: brotherIds } }),
        select: { brotherId: true, role: { select: { id: true, name: true, color: true, rank: true } } },
      }),
    create: (args: Omit<Prisma.BrotherRoleCreateArgs, "data"> & { data: Omit<Prisma.BrotherRoleUncheckedCreateInput, "organizationId"> }) =>
      prisma.brotherRole.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    delete: async (args: Prisma.BrotherRoleDeleteArgs) => {
      const { brotherId, roleId } = (args.where as { brotherId_roleId: { brotherId: number; roleId: number } }).brotherId_roleId;
      await verifyComposite(brotherId, roleId);
      return prisma.brotherRole.delete(args);
    },
  };
}

function scopedOrgMetricDefinition(orgId: number) {
  type W = Prisma.OrgMetricDefinitionWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.OrgMetricDefinitionWhereUniqueInput): Promise<number> {
    const row = await prisma.orgMetricDefinition.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.OrgMetricDefinitionFindManyArgs)  => prisma.orgMetricDefinition.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.OrgMetricDefinitionFindFirstArgs) => prisma.orgMetricDefinition.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.OrgMetricDefinitionFindUniqueArgs) => prisma.orgMetricDefinition.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.OrgMetricDefinitionCreateArgs, "data"> & { data: Omit<Prisma.OrgMetricDefinitionUncheckedCreateInput, "organizationId"> }) =>
      prisma.orgMetricDefinition.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.OrgMetricDefinitionUpdateArgs) =>
      prisma.orgMetricDefinition.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.OrgMetricDefinitionDeleteArgs) =>
      prisma.orgMetricDefinition.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.OrgMetricDefinitionCountArgs) => prisma.orgMetricDefinition.count({ ...args, where: org(args?.where) }),
  };
}

function scopedBrotherMetricValue(orgId: number) {
  type W = Prisma.BrotherMetricValueWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.BrotherMetricValueWhereUniqueInput): Promise<number> {
    const row = await prisma.brotherMetricValue.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.BrotherMetricValueFindManyArgs)  => prisma.brotherMetricValue.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.BrotherMetricValueFindFirstArgs) => prisma.brotherMetricValue.findFirst({ ...args, where: org(args?.where) }),
    create:     (args: Omit<Prisma.BrotherMetricValueCreateArgs, "data"> & { data: Omit<Prisma.BrotherMetricValueUncheckedCreateInput, "organizationId"> }) =>
      prisma.brotherMetricValue.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    upsert:     (args: Prisma.BrotherMetricValueUpsertArgs) => prisma.brotherMetricValue.upsert(args),
    update:     async (args: Prisma.BrotherMetricValueUpdateArgs) =>
      prisma.brotherMetricValue.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.BrotherMetricValueDeleteArgs) =>
      prisma.brotherMetricValue.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.BrotherMetricValueCountArgs) => prisma.brotherMetricValue.count({ ...args, where: org(args?.where) }),
    /**
     * Value sum + avg per metric definition, batched into ONE groupBy.
     * Org-scoped via the injected organizationId filter. Returns a Map of
     * metricDefinitionId → { _avg, _sum, _count }; definitions with no values
     * are absent (callers should default). Mirrors countByRole pattern.
     */
    aggregateByDefinition: async (defIds: number[]) => {
      if (defIds.length === 0) return new Map<number, { avg: number | null; sum: number; count: number }>();
      const rows = await prisma.brotherMetricValue.groupBy({
        by: ["metricDefinitionId"],
        where: org({ metricDefinitionId: { in: defIds } }),
        _avg:   { value: true },
        _sum:   { value: true },
        _count: { value: true },
      });
      return new Map(rows.map(r => [
        r.metricDefinitionId,
        { avg: r._avg.value, sum: r._sum.value ?? 0, count: r._count.value },
      ]));
    },
    /**
     * Count of members whose value >= threshold for a set of (defId, threshold)
     * pairs. Issues one COUNT per pair — acceptable at ≤20 definitions.
     * Returns a Map of metricDefinitionId → count.
     */
    countOnTrack: async (defs: { id: number; goal: number }[]): Promise<Map<number, number>> => {
      if (defs.length === 0) return new Map();
      const entries = await Promise.all(
        defs.map(async d => {
          const n = await prisma.brotherMetricValue.count({
            where: org({ metricDefinitionId: d.id, value: { gte: d.goal } }),
          });
          return [d.id, n] as [number, number];
        }),
      );
      return new Map(entries);
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
    upsert: (data: { enabledWorkflows?: string[]; vocabularyOverrides?: Record<string, string>; thresholds?: Prisma.InputJsonValue; disabledFeatures?: Prisma.InputJsonValue; customMemberFields?: Prisma.InputJsonValue }) =>
      prisma.organizationConfig.upsert({
        where:  { organizationId: orgId },
        update: data,
        create: { organizationId: orgId, ...data },
      }),
  };
}

function scopedReimbursement(orgId: number) {
  type W = Prisma.ReimbursementWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ReimbursementWhereUniqueInput): Promise<number> {
    const row = await prisma.reimbursement.findFirst({ where: org(where as W), select: { id: true } });
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ReimbursementFindManyArgs)  => prisma.reimbursement.findMany({ ...args, where: org(args?.where) }),
    findFirst:  (args?: Prisma.ReimbursementFindFirstArgs) => prisma.reimbursement.findFirst({ ...args, where: org(args?.where) }),
    findUnique: (args: Prisma.ReimbursementFindUniqueArgs) => prisma.reimbursement.findFirst({ ...args, where: org(args.where as W) }),
    create:     (args: Omit<Prisma.ReimbursementCreateArgs, "data"> & { data: Omit<Prisma.ReimbursementUncheckedCreateInput, "organizationId"> }) =>
      prisma.reimbursement.create({ ...args, data: { ...args.data, organizationId: orgId } }),
    update:     async (args: Prisma.ReimbursementUpdateArgs) =>
      prisma.reimbursement.update({ ...args, where: { id: await verify(args.where) } }),
    delete:     async (args: Prisma.ReimbursementDeleteArgs) =>
      prisma.reimbursement.delete({ where: { id: await verify(args.where) } }),
    count:      (args?: Prisma.ReimbursementCountArgs)     => prisma.reimbursement.count({ ...args, where: org(args?.where) }),
  };
}

// ---------------------------------------------------------------------------
// Relation-scoped delegates for org-column-less join tables
// ---------------------------------------------------------------------------
//
// AttendanceRecord, AttendanceExcuse, BudgetAllocation and InviteRedemption have
// no organizationId column, so the org filter is injected via a required relation
// to an org-bound parent (e.g. calendarEvent.organizationId). Previously these
// were raw pass-throughs (prisma.*) — a bare `id`/`brotherId` WHERE returned rows
// from any org, so tenancy depended on every caller remembering to add the filter
// itself. These wrappers make org scoping automatic and the cross-tenant default
// fail-closed.
//
// Reads only: every write to these tables today happens inside a $transaction
// callback whose `tx` client is intentionally raw (it SET LOCALs app.org_id and
// the caller injects org scoping explicitly). The wrappers below cover the read
// surface that flows through ctx.db.

// Each delegate is generic over the caller's args so Prisma's conditional return
// types (the select/include payload shapes) flow through unchanged — the wrapper
// only rewrites `where`, never the result type. findUnique is mapped to findFirst
// because a relation/extra filter can't live in WhereUniqueInput; the return type
// is still T | null, identical for every existing caller.

// findUnique selectors may use a compound-key shorthand (e.g.
// `calendarEventId_brotherId: { calendarEventId, brotherId }`) that only exists on
// WhereUniqueInput. WhereInput (used by findFirst) doesn't know it, so flatten any
// such nested key object up to its scalar fields before handing it to findFirst.
// Scalar/relation keys pass through untouched.
function flattenCompoundKey(where: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!where) return {};
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(where)) {
    // A compound-key entry is a plain object whose key name joins fields with "_"
    // (Prisma's @@unique naming). Spread its inner scalar fields to the top level.
    if (key.includes("_") && val !== null && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(out, val as Record<string, unknown>);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function scopedAttendanceRecord(orgId: number) {
  type W = Prisma.AttendanceRecordWhereInput;
  // Scope through the CalendarEvent parent (org-bound). The relation filter
  // narrows to records whose event belongs to this org regardless of the
  // caller's WHERE (calendarEventId, brotherId, semesterId, …).
  const org = (w?: W): W => ({ ...w, calendarEvent: { is: { organizationId: orgId } } });
  return {
    findMany: <T extends Prisma.AttendanceRecordFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.AttendanceRecordFindManyArgs>) =>
      prisma.attendanceRecord.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.AttendanceRecordFindManyArgs>),
    findFirst: <T extends Prisma.AttendanceRecordFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.AttendanceRecordFindFirstArgs>) =>
      prisma.attendanceRecord.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.AttendanceRecordFindFirstArgs>),
    // findUnique → findFirst: WhereUniqueInput can't carry a relation filter, so
    // a composite-key lookup (calendarEventId_brotherId) becomes a findFirst that
    // ANDs the same key fields with the org relation. Same T | null shape.
    findUnique: <T extends Prisma.AttendanceRecordFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.AttendanceRecordFindUniqueArgs>) =>
      prisma.attendanceRecord.findFirst<T & Prisma.AttendanceRecordFindFirstArgs>({ ...(args as object), where: org(flattenCompoundKey((args as { where?: Record<string, unknown> }).where) as W) } as Prisma.SelectSubset<T & Prisma.AttendanceRecordFindFirstArgs, Prisma.AttendanceRecordFindFirstArgs>),
    count: (args?: Prisma.AttendanceRecordCountArgs) => prisma.attendanceRecord.count({ ...args, where: org(args?.where) }),
  };
}

function scopedAttendanceExcuse(orgId: number) {
  type W = Prisma.AttendanceExcuseWhereInput;
  // Scope through the Brother parent (org-bound) — the same relation excuse-service
  // already used to close this IDOR by hand. Equivalent to calendarEvent scoping
  // since an excuse's brother and event are always in the same org.
  const org = (w?: W): W => ({ ...w, brother: { is: { organizationId: orgId } } });
  return {
    findMany: <T extends Prisma.AttendanceExcuseFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.AttendanceExcuseFindManyArgs>) =>
      prisma.attendanceExcuse.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.AttendanceExcuseFindManyArgs>),
    findFirst: <T extends Prisma.AttendanceExcuseFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.AttendanceExcuseFindFirstArgs>) =>
      prisma.attendanceExcuse.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.AttendanceExcuseFindFirstArgs>),
    findUnique: <T extends Prisma.AttendanceExcuseFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.AttendanceExcuseFindUniqueArgs>) =>
      prisma.attendanceExcuse.findFirst<T & Prisma.AttendanceExcuseFindFirstArgs>({ ...(args as object), where: org(flattenCompoundKey((args as { where?: Record<string, unknown> }).where) as W) } as Prisma.SelectSubset<T & Prisma.AttendanceExcuseFindFirstArgs, Prisma.AttendanceExcuseFindFirstArgs>),
    // updateMany accepts WhereInput, so the org relation is injected directly.
    // A foreign-org excuse matches zero rows (count: 0) rather than being mutated.
    updateMany: (args: Omit<Prisma.AttendanceExcuseUpdateManyArgs, "where"> & { where?: W }) =>
      prisma.attendanceExcuse.updateMany({ ...args, where: org(args.where) }),
    count: (args?: Prisma.AttendanceExcuseCountArgs) => prisma.attendanceExcuse.count({ ...args, where: org(args?.where) }),
  };
}

function scopedBudgetAllocation(orgId: number) {
  type W = Prisma.BudgetAllocationWhereInput;
  // Scope through the Budget parent (org-bound). No ctx.db read callers today —
  // writes go through budget-service's $transaction — but this keeps the delegate
  // fail-closed for any future read.
  const org = (w?: W): W => ({ ...w, budget: { is: { organizationId: orgId } } });
  return {
    findMany: <T extends Prisma.BudgetAllocationFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.BudgetAllocationFindManyArgs>) =>
      prisma.budgetAllocation.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.BudgetAllocationFindManyArgs>),
    findFirst: <T extends Prisma.BudgetAllocationFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.BudgetAllocationFindFirstArgs>) =>
      prisma.budgetAllocation.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.BudgetAllocationFindFirstArgs>),
    count: (args?: Prisma.BudgetAllocationCountArgs) => prisma.budgetAllocation.count({ ...args, where: org(args?.where) }),
  };
}

function scopedInviteRedemption(orgId: number) {
  type W = Prisma.InviteRedemptionWhereInput;
  // Scope through the OrgInvite parent (org-bound). No ctx.db read callers today
  // (the count is computed via scopedOrgInvite.redemptionCountByInvite from
  // org-scoped invite ids), but fail-closed for any future read.
  const org = (w?: W): W => ({ ...w, invite: { is: { organizationId: orgId } } });
  return {
    findMany: <T extends Prisma.InviteRedemptionFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.InviteRedemptionFindManyArgs>) =>
      prisma.inviteRedemption.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.InviteRedemptionFindManyArgs>),
    findFirst: <T extends Prisma.InviteRedemptionFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.InviteRedemptionFindFirstArgs>) =>
      prisma.inviteRedemption.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.InviteRedemptionFindFirstArgs>),
    count: (args?: Prisma.InviteRedemptionCountArgs) => prisma.inviteRedemption.count({ ...args, where: org(args?.where) }),
  };
}

function scopedMembership(orgId: number) {
  type W = Prisma.MembershipWhereInput;
  // Membership HAS an organizationId column, so it's scoped directly like the
  // first-class delegates. Reads are limited to this org's memberships; the
  // last-admin guard (membership-service) and any roster-by-membership read are
  // now org-safe by default instead of relying on a manual organizationId filter.
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany: <T extends Prisma.MembershipFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.MembershipFindManyArgs>) =>
      prisma.membership.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.MembershipFindManyArgs>),
    findFirst: <T extends Prisma.MembershipFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.MembershipFindFirstArgs>) =>
      prisma.membership.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.MembershipFindFirstArgs>),
    count: (args?: Prisma.MembershipCountArgs) => prisma.membership.count({ ...args, where: org(args?.where) }),
  };
}

function scopedOrganization(orgId: number) {
  // Organization is the tenant ROOT, not an org-scoped child: there is no
  // organizationId column — the row IS the org. "Scoping" means the only row a
  // request may touch is its own active org, so we force where.id = orgId on
  // every read/update. A caller can never select or mutate a different org's row.
  type W = Prisma.OrganizationWhereInput;
  return {
    findUnique: <T extends Prisma.OrganizationFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.OrganizationFindUniqueArgs>) =>
      prisma.organization.findFirst<T & Prisma.OrganizationFindFirstArgs>({ ...(args as object), where: { ...((args as { where?: W }).where), id: orgId } } as Prisma.SelectSubset<T & Prisma.OrganizationFindFirstArgs, Prisma.OrganizationFindFirstArgs>),
    findFirst: <T extends Prisma.OrganizationFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.OrganizationFindFirstArgs>) =>
      prisma.organization.findFirst<T>({ ...(args as object), where: { ...((args as T | undefined)?.where), id: orgId } } as Prisma.SelectSubset<T, Prisma.OrganizationFindFirstArgs>),
    update: (args: Omit<Prisma.OrganizationUpdateArgs, "where"> & { where?: Prisma.OrganizationWhereUniqueInput }) =>
      prisma.organization.update({ ...args, where: { id: orgId } }),
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
    serviceParticipation: scopedServiceParticipation(orgId),
    partyEvent:          scopedPartyEvent(orgId),
    task:                scopedTask(orgId),
    taskAssignment:      scopedTaskAssignment(orgId),
    instagramTask:       scopedInstagramTask(orgId),
    doc:                 scopedDoc(orgId),
    programmingEvent:    scopedProgrammingEvent(orgId),
    programmingEventDoc: scopedProgrammingEventDoc(orgId),
    programmingChecklistItem: scopedProgrammingChecklistItem(orgId),
    transaction:         scopedTransaction(orgId),
    reimbursement:       scopedReimbursement(orgId),
    budget:              scopedBudget(orgId),
    activityLog:         scopedActivityLog(orgId),
    chapterAnnouncement: scopedChapterAnnouncement(orgId),

    brotherRole:          scopedBrotherRole(orgId),
    orgInvite:            scopedOrgInvite(orgId),
    organizationConfig:   scopedOrganizationConfig(orgId),
    orgMetricDefinition:  scopedOrgMetricDefinition(orgId),
    brotherMetricValue:   scopedBrotherMetricValue(orgId),

    // Org-column-less join tables: scoped via a required relation to an org-bound
    // parent (CalendarEvent / Brother / Budget / OrgInvite). Membership and the
    // Organization root are scoped directly. These were raw pass-throughs before
    // the F2 hardening — a bare id/brotherId WHERE used to return cross-org rows.
    attendanceRecord:    scopedAttendanceRecord(orgId),
    attendanceExcuse:    scopedAttendanceExcuse(orgId),
    budgetAllocation:    scopedBudgetAllocation(orgId),
    inviteRedemption:    scopedInviteRedemption(orgId),
    membership:          scopedMembership(orgId),
    organization:        scopedOrganization(orgId),

    // PlatformAdmin is intentionally GLOBAL (not org-scoped): it records
    // platform-level super-admins, who exist independent of any single org. It's
    // only ever touched via the raw `tx` client in deleteOrg's teardown, never as
    // org-scoped data, so it stays a raw pass-through by design.
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
