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
// RLS session-variable helper (Phase 2)
// ---------------------------------------------------------------------------

// When RLS_SET_ORG_ID=1, every scoped delegate operation runs inside an implicit
// Prisma transaction that begins with `SET LOCAL app.org_id = '<orgId>'`.  This
// pins the Postgres session variable for the lifetime of that query so enforcing
// RLS policies (Phase 3) can see it.
//
// SET LOCAL is transaction-scoped and automatically rolled back on COMMIT, so
// it never leaks across connections under PgBouncer transaction-mode pooling
// (the only safe pattern — plain `SET app.org_id` would bleed to other tenants
// checking out the same connection after COMMIT).
//
// When the flag is OFF (the default), `run` calls fn(prisma) directly —
// byte-identical to the pre-Phase-2 behaviour, so the flag is a clean rollback
// lever that requires no redeploy.
//
// Round-trip note: each wrapped call issues BEGIN + SET LOCAL + <query> + COMMIT
// on a single pooler connection checkout (4 wire statements → 1 checkout).
// Measure latency in staging before enabling in production.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = typeof prisma & Record<string, any>;
type Run = <T>(fn: (p: P) => Promise<T>) => Promise<T>;

const RLS_WRAP = process.env.RLS_SET_ORG_ID === "1";

function makeRun(orgId: number, client: P = prisma as P): Run {
  if (!RLS_WRAP) return fn => fn(client);
  // orgId is already validated as a positive integer by the db() guard before
  // makeRun is called. Math.trunc makes that guarantee local to this line.
  const setLocal = `SET LOCAL app.org_id = '${Math.trunc(orgId)}'`;
  return fn =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(setLocal);
      return fn(tx as P);
    });
}

/**
 * Exported only for tests. Creates a `Run` wrapper bound to a given Prisma
 * client (e.g. `appPrisma` — the NOBYPASSRLS test-app role) so the RLS
 * enforcement path can be exercised without the production `prisma` singleton.
 *
 * Always behaves as if RLS_SET_ORG_ID=1 regardless of the env flag, since the
 * test needs the SET LOCAL path to be active. The flag still gates production
 * behaviour via `db()`.
 */
export function _makeRunForTest(orgId: number, client: P): Run {
  const setLocal = `SET LOCAL app.org_id = '${Math.trunc(orgId)}'`;
  return fn =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(setLocal);
      return fn(tx as P);
    });
}

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

function scopedBrother(orgId: number, run: Run) {
  type W = Prisma.BrotherWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.BrotherWhereUniqueInput): Promise<number> {
    const row = await run(p => p.brother.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.BrotherFindManyArgs)  => run(p => p.brother.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.BrotherFindFirstArgs) => run(p => p.brother.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.BrotherFindUniqueArgs) => run(p => p.brother.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.BrotherCreateArgs, "data"> & { data: Omit<Prisma.BrotherUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.brother.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.BrotherUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.brother.update({ ...args, where: { id } }));
    },
    updateMany: (args: Omit<Prisma.BrotherUpdateManyArgs, "where"> & { where?: W }) =>
      run(p => p.brother.updateMany({ ...args, where: org(args.where) })),
    delete:     async (args: Prisma.BrotherDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.brother.delete({ where: { id } }));
    },
    count:      (args?: Prisma.BrotherCountArgs)     => run(p => p.brother.count({ ...args, where: org(args?.where) })),
    aggregate:  (args: Omit<Prisma.BrotherAggregateArgs, "where"> & { where?: W }) =>
      run(p => p.brother.aggregate({ ...args, where: org(args?.where) })),
  };
}

function scopedRole(orgId: number, run: Run) {
  type W = Prisma.RoleWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.RoleWhereUniqueInput): Promise<number> {
    const row = await run(p => p.role.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    // Generic so an include (e.g. brothers → BrotherRole join) flows through.
    findMany:   <T extends Prisma.RoleFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.RoleFindManyArgs>) =>
      run(p => p.role.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.RoleFindManyArgs>)),
    findFirst:  (args?: Prisma.RoleFindFirstArgs) => run(p => p.role.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.RoleFindUniqueArgs) => run(p => p.role.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.RoleCreateArgs, "data"> & { data: Omit<Prisma.RoleUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.role.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.RoleUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.role.update({ ...args, where: { id } }));
    },
    updateMany: (args: Omit<Prisma.RoleUpdateManyArgs, "where"> & { where?: W }) =>
      run(p => p.role.updateMany({ ...args, where: org(args.where) })),
    delete:     async (args: Prisma.RoleDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.role.delete({ where: { id } }));
    },
    count:      (args?: Prisma.RoleCountArgs)     => run(p => p.role.count({ ...args, where: org(args?.where) })),
  };
}

function scopedSemester(orgId: number, run: Run) {
  type W = Prisma.SemesterWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.SemesterWhereUniqueInput): Promise<number> {
    const row = await run(p => p.semester.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.SemesterFindManyArgs)  => run(p => p.semester.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.SemesterFindFirstArgs) => run(p => p.semester.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.SemesterFindUniqueArgs) => run(p => p.semester.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.SemesterCreateArgs, "data"> & { data: Omit<Prisma.SemesterUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.semester.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.SemesterUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.semester.update({ ...args, where: { id } }));
    },
    updateMany: (args: Omit<Prisma.SemesterUpdateManyArgs, "where"> & { where?: W }) =>
      run(p => p.semester.updateMany({ ...args, where: org(args.where) })),
    delete:     async (args: Prisma.SemesterDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.semester.delete({ where: { id } }));
    },
    count:      (args?: Prisma.SemesterCountArgs)     => run(p => p.semester.count({ ...args, where: org(args?.where) })),
  };
}

function scopedCalendarEvent(orgId: number, run: Run) {
  type W = Prisma.CalendarEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.CalendarEventWhereUniqueInput): Promise<number> {
    const row = await run(p => p.calendarEvent.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.CalendarEventFindManyArgs)  => run(p => p.calendarEvent.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.CalendarEventFindFirstArgs) => run(p => p.calendarEvent.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.CalendarEventFindUniqueArgs) => run(p => p.calendarEvent.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.CalendarEventCreateArgs, "data"> & { data: Omit<Prisma.CalendarEventUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.calendarEvent.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.CalendarEventUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.calendarEvent.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.CalendarEventDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.calendarEvent.delete({ where: { id } }));
    },
    count:      (args?: Prisma.CalendarEventCountArgs)     => run(p => p.calendarEvent.count({ ...args, where: org(args?.where) })),
  };
}

function scopedServiceEvent(orgId: number, run: Run) {
  type W = Prisma.ServiceEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ServiceEventWhereUniqueInput): Promise<number> {
    const row = await run(p => p.serviceEvent.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ServiceEventFindManyArgs)  => run(p => p.serviceEvent.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.ServiceEventFindFirstArgs) => run(p => p.serviceEvent.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.ServiceEventFindUniqueArgs) => run(p => p.serviceEvent.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.ServiceEventCreateArgs, "data"> & { data: Omit<Prisma.ServiceEventUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.serviceEvent.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.ServiceEventUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.serviceEvent.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.ServiceEventDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.serviceEvent.delete({ where: { id } }));
    },
    count:      (args?: Prisma.ServiceEventCountArgs)     => run(p => p.serviceEvent.count({ ...args, where: org(args?.where) })),
  };
}

function scopedServiceParticipation(orgId: number, run: Run) {
  type W = Prisma.ServiceParticipationWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ServiceParticipationWhereUniqueInput): Promise<number> {
    const row = await run(p => p.serviceParticipation.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ServiceParticipationFindManyArgs)  => run(p => p.serviceParticipation.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.ServiceParticipationFindFirstArgs) => run(p => p.serviceParticipation.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.ServiceParticipationFindUniqueArgs) => run(p => p.serviceParticipation.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.ServiceParticipationCreateArgs, "data"> & { data: Omit<Prisma.ServiceParticipationUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.serviceParticipation.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.ServiceParticipationUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.serviceParticipation.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.ServiceParticipationDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.serviceParticipation.delete({ where: { id } }));
    },
    deleteMany: (args?: Omit<Prisma.ServiceParticipationDeleteManyArgs, "where"> & { where?: W }) =>
      run(p => p.serviceParticipation.deleteMany({ ...args, where: org(args?.where) })),
    count:      (args?: Prisma.ServiceParticipationCountArgs)     => run(p => p.serviceParticipation.count({ ...args, where: org(args?.where) })),
  };
}

function scopedPartyEvent(orgId: number, run: Run) {
  type W = Prisma.PartyEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.PartyEventWhereUniqueInput): Promise<number> {
    const row = await run(p => p.partyEvent.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.PartyEventFindManyArgs)  => run(p => p.partyEvent.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.PartyEventFindFirstArgs) => run(p => p.partyEvent.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.PartyEventFindUniqueArgs) => run(p => p.partyEvent.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.PartyEventCreateArgs, "data"> & { data: Omit<Prisma.PartyEventUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.partyEvent.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.PartyEventUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.partyEvent.update({ ...args, where: { id } }));
    },
    updateMany: (args: Omit<Prisma.PartyEventUpdateManyArgs, "where"> & { where?: W }) =>
      run(p => p.partyEvent.updateMany({ ...args, where: org(args.where) })),
    delete:     async (args: Prisma.PartyEventDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.partyEvent.delete({ where: { id } }));
    },
    count:      (args?: Prisma.PartyEventCountArgs)     => run(p => p.partyEvent.count({ ...args, where: org(args?.where) })),
    aggregate:  (args: Omit<Prisma.PartyEventAggregateArgs, "where"> & { where?: W }) =>
      run(p => p.partyEvent.aggregate({ ...args, where: org(args?.where) })),
  };
}

function scopedTask(orgId: number, run: Run) {
  type W = Prisma.TaskWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.TaskWhereUniqueInput): Promise<number> {
    const row = await run(p => p.task.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    // Generic over the caller's args so include/select payload types survive the
    // wrapper (the non-generic Prisma.TaskFindManyArgs form erased them to base Task).
    findMany:   <T extends Prisma.TaskFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.TaskFindManyArgs>) =>
      run(p => p.task.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.TaskFindManyArgs>)),
    findFirst:  (args?: Prisma.TaskFindFirstArgs) => run(p => p.task.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.TaskFindUniqueArgs) => run(p => p.task.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.TaskCreateArgs, "data"> & { data: Omit<Prisma.TaskUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.task.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.TaskUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.task.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.TaskDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.task.delete({ where: { id } }));
    },
    count:      (args?: Prisma.TaskCountArgs)     => run(p => p.task.count({ ...args, where: org(args?.where) })),
  };
}

function scopedTaskAssignment(orgId: number, run: Run) {
  type W = Prisma.TaskAssignmentWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  return {
    findMany:   (args?: Prisma.TaskAssignmentFindManyArgs) => run(p => p.taskAssignment.findMany({ ...args, where: org(args?.where) })),
    createMany: (args: { data: Omit<Prisma.TaskAssignmentUncheckedCreateInput, "organizationId">[] }) =>
      run(p => p.taskAssignment.createMany({ data: args.data.map(d => ({ ...d, organizationId: orgId })) })),
    deleteMany: (args?: Prisma.TaskAssignmentDeleteManyArgs) => run(p => p.taskAssignment.deleteMany({ ...args, where: org(args?.where) })),
    count:      (args?: Prisma.TaskAssignmentCountArgs)     => run(p => p.taskAssignment.count({ ...args, where: org(args?.where) })),
  };
}

function scopedAttendanceExemption(orgId: number, run: Run) {
  type W = Prisma.AttendanceExemptionWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.AttendanceExemptionWhereUniqueInput): Promise<number> {
    const row = await run(p => p.attendanceExemption.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany: <T extends Prisma.AttendanceExemptionFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.AttendanceExemptionFindManyArgs>) =>
      run(p => p.attendanceExemption.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.AttendanceExemptionFindManyArgs>)),
    findFirst:  (args?: Prisma.AttendanceExemptionFindFirstArgs) => run(p => p.attendanceExemption.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.AttendanceExemptionFindUniqueArgs) => run(p => p.attendanceExemption.findFirst({ ...args, where: org(flattenCompoundKey(args.where) as W) })),
    create:     (args: Omit<Prisma.AttendanceExemptionCreateArgs, "data"> & { data: Omit<Prisma.AttendanceExemptionUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.attendanceExemption.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.AttendanceExemptionUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.attendanceExemption.update({ ...args, where: { id } }));
    },
    // upsert-by-unique: verify() can't run on a not-yet-existing row, so scope the
    // create branch's organizationId here and let the compound unique dedupe.
    upsert:     (args: Omit<Prisma.AttendanceExemptionUpsertArgs, "create"> & { create: Omit<Prisma.AttendanceExemptionUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.attendanceExemption.upsert({ ...args, create: { ...args.create, organizationId: orgId } } as Prisma.AttendanceExemptionUpsertArgs)),
    delete:     async (args: Prisma.AttendanceExemptionDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.attendanceExemption.delete({ where: { id } }));
    },
    deleteMany: (args?: Omit<Prisma.AttendanceExemptionDeleteManyArgs, "where"> & { where?: W }) =>
      run(p => p.attendanceExemption.deleteMany({ ...args, where: org(args?.where) })),
    count:      (args?: Prisma.AttendanceExemptionCountArgs) => run(p => p.attendanceExemption.count({ ...args, where: org(args?.where) })),
  };
}

function scopedPoll(orgId: number, run: Run) {
  type W = Prisma.PollWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.PollWhereUniqueInput): Promise<number> {
    const row = await run(p => p.poll.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    // Generic over the caller's args so include/select payload types survive the
    // wrapper (mirrors scopedTask — the non-generic form erases them to base Poll).
    findMany:   <T extends Prisma.PollFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.PollFindManyArgs>) =>
      run(p => p.poll.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.PollFindManyArgs>)),
    findFirst:  (args?: Prisma.PollFindFirstArgs) => run(p => p.poll.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.PollFindUniqueArgs) => run(p => p.poll.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.PollCreateArgs, "data"> & { data: Omit<Prisma.PollUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.poll.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.PollUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.poll.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.PollDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.poll.delete({ where: { id } }));
    },
    count:      (args?: Prisma.PollCountArgs)     => run(p => p.poll.count({ ...args, where: org(args?.where) })),
  };
}

function scopedPollOption(orgId: number, run: Run) {
  type W = Prisma.PollOptionWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  return {
    findMany:   (args?: Prisma.PollOptionFindManyArgs) => run(p => p.pollOption.findMany({ ...args, where: org(args?.where) })),
    createMany: (args: { data: Omit<Prisma.PollOptionUncheckedCreateInput, "organizationId">[] }) =>
      run(p => p.pollOption.createMany({ data: args.data.map(d => ({ ...d, organizationId: orgId })) })),
    deleteMany: (args?: Prisma.PollOptionDeleteManyArgs) => run(p => p.pollOption.deleteMany({ ...args, where: org(args?.where) })),
    count:      (args?: Prisma.PollOptionCountArgs)     => run(p => p.pollOption.count({ ...args, where: org(args?.where) })),
  };
}

function scopedPollAssignment(orgId: number, run: Run) {
  type W = Prisma.PollAssignmentWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  return {
    findMany:   (args?: Prisma.PollAssignmentFindManyArgs) => run(p => p.pollAssignment.findMany({ ...args, where: org(args?.where) })),
    createMany: (args: { data: Omit<Prisma.PollAssignmentUncheckedCreateInput, "organizationId">[] }) =>
      run(p => p.pollAssignment.createMany({ data: args.data.map(d => ({ ...d, organizationId: orgId })) })),
    deleteMany: (args?: Prisma.PollAssignmentDeleteManyArgs) => run(p => p.pollAssignment.deleteMany({ ...args, where: org(args?.where) })),
    count:      (args?: Prisma.PollAssignmentCountArgs)     => run(p => p.pollAssignment.count({ ...args, where: org(args?.where) })),
  };
}

function scopedPollVote(orgId: number, run: Run) {
  type W = Prisma.PollVoteWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  return {
    findMany:   (args?: Prisma.PollVoteFindManyArgs) => run(p => p.pollVote.findMany({ ...args, where: org(args?.where) })),
    // upsert is a pass-through (mirrors scopedBudget): the (pollId, brotherId)
    // unique key already pins the row, and create carries organizationId from
    // the caller. The target poll is verified org-scoped before this runs.
    upsert:     (args: Prisma.PollVoteUpsertArgs) => run(p => p.pollVote.upsert(args)),
    deleteMany: (args?: Prisma.PollVoteDeleteManyArgs) => run(p => p.pollVote.deleteMany({ ...args, where: org(args?.where) })),
    count:      (args?: Prisma.PollVoteCountArgs)     => run(p => p.pollVote.count({ ...args, where: org(args?.where) })),
  };
}

function scopedInstagramTask(orgId: number, run: Run) {
  type W = Prisma.InstagramTaskWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.InstagramTaskWhereUniqueInput): Promise<number> {
    const row = await run(p => p.instagramTask.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.InstagramTaskFindManyArgs)  => run(p => p.instagramTask.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.InstagramTaskFindFirstArgs) => run(p => p.instagramTask.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.InstagramTaskFindUniqueArgs) => run(p => p.instagramTask.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.InstagramTaskCreateArgs, "data"> & { data: Omit<Prisma.InstagramTaskUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.instagramTask.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.InstagramTaskUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.instagramTask.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.InstagramTaskDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.instagramTask.delete({ where: { id } }));
    },
    count:      (args?: Prisma.InstagramTaskCountArgs)     => run(p => p.instagramTask.count({ ...args, where: org(args?.where) })),
  };
}

function scopedDoc(orgId: number, run: Run) {
  type W = Prisma.DocWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.DocWhereUniqueInput): Promise<number> {
    const row = await run(p => p.doc.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.DocFindManyArgs)  => run(p => p.doc.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.DocFindFirstArgs) => run(p => p.doc.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.DocFindUniqueArgs) => run(p => p.doc.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.DocCreateArgs, "data"> & { data: Omit<Prisma.DocUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.doc.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.DocUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.doc.update({ ...args, where: { id } }));
    },
    updateMany: (args: Omit<Prisma.DocUpdateManyArgs, "where"> & { where?: W }) =>
      run(p => p.doc.updateMany({ ...args, where: org(args.where) })),
    delete:     async (args: Prisma.DocDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.doc.delete({ where: { id } }));
    },
    count:      (args?: Prisma.DocCountArgs)     => run(p => p.doc.count({ ...args, where: org(args?.where) })),
  };
}

function scopedDocFolder(orgId: number, run: Run) {
  type W = Prisma.DocFolderWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.DocFolderWhereUniqueInput): Promise<number> {
    const row = await run(p => p.docFolder.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.DocFolderFindManyArgs)  => run(p => p.docFolder.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.DocFolderFindFirstArgs) => run(p => p.docFolder.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.DocFolderFindUniqueArgs) => run(p => p.docFolder.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.DocFolderCreateArgs, "data"> & { data: Omit<Prisma.DocFolderUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.docFolder.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.DocFolderUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.docFolder.update({ ...args, where: { id } }));
    },
    updateMany: (args: Omit<Prisma.DocFolderUpdateManyArgs, "where"> & { where?: W }) =>
      run(p => p.docFolder.updateMany({ ...args, where: org(args.where) })),
    delete:     async (args: Prisma.DocFolderDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.docFolder.delete({ where: { id } }));
    },
    count:      (args?: Prisma.DocFolderCountArgs)     => run(p => p.docFolder.count({ ...args, where: org(args?.where) })),
  };
}

function scopedProgrammingEvent(orgId: number, run: Run) {
  type W = Prisma.ProgrammingEventWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ProgrammingEventWhereUniqueInput): Promise<number> {
    const row = await run(p => p.programmingEvent.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ProgrammingEventFindManyArgs)  => run(p => p.programmingEvent.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.ProgrammingEventFindFirstArgs) => run(p => p.programmingEvent.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.ProgrammingEventFindUniqueArgs) => run(p => p.programmingEvent.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.ProgrammingEventCreateArgs, "data"> & { data: Omit<Prisma.ProgrammingEventUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.programmingEvent.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.ProgrammingEventUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.programmingEvent.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.ProgrammingEventDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.programmingEvent.delete({ where: { id } }));
    },
    count:      (args?: Prisma.ProgrammingEventCountArgs)     => run(p => p.programmingEvent.count({ ...args, where: org(args?.where) })),
  };
}

function scopedProgrammingEventDoc(orgId: number, run: Run) {
  type W = Prisma.ProgrammingEventDocWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ProgrammingEventDocWhereUniqueInput): Promise<number> {
    const row = await run(p => p.programmingEventDoc.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ProgrammingEventDocFindManyArgs)  => run(p => p.programmingEventDoc.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.ProgrammingEventDocFindFirstArgs) => run(p => p.programmingEventDoc.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.ProgrammingEventDocFindUniqueArgs) => run(p => p.programmingEventDoc.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.ProgrammingEventDocCreateArgs, "data"> & { data: Omit<Prisma.ProgrammingEventDocUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.programmingEventDoc.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    delete:     async (args: Prisma.ProgrammingEventDocDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.programmingEventDoc.delete({ where: { id } }));
    },
    deleteMany: (args?: Prisma.ProgrammingEventDocDeleteManyArgs) =>
      run(p => p.programmingEventDoc.deleteMany({ ...args, where: org(args?.where) })),
    count:      (args?: Prisma.ProgrammingEventDocCountArgs)     => run(p => p.programmingEventDoc.count({ ...args, where: org(args?.where) })),
  };
}

function scopedProgrammingChecklistItem(orgId: number, run: Run) {
  type W = Prisma.ProgrammingChecklistItemWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ProgrammingChecklistItemWhereUniqueInput): Promise<number> {
    const row = await run(p => p.programmingChecklistItem.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ProgrammingChecklistItemFindManyArgs)  => run(p => p.programmingChecklistItem.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.ProgrammingChecklistItemFindFirstArgs) => run(p => p.programmingChecklistItem.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.ProgrammingChecklistItemFindUniqueArgs) => run(p => p.programmingChecklistItem.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.ProgrammingChecklistItemCreateArgs, "data"> & { data: Omit<Prisma.ProgrammingChecklistItemUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.programmingChecklistItem.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.ProgrammingChecklistItemUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.programmingChecklistItem.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.ProgrammingChecklistItemDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.programmingChecklistItem.delete({ where: { id } }));
    },
    deleteMany: (args?: Prisma.ProgrammingChecklistItemDeleteManyArgs) =>
      run(p => p.programmingChecklistItem.deleteMany({ ...args, where: org(args?.where) })),
    count:      (args?: Prisma.ProgrammingChecklistItemCountArgs)     => run(p => p.programmingChecklistItem.count({ ...args, where: org(args?.where) })),
    aggregate:  (args: Omit<Prisma.ProgrammingChecklistItemAggregateArgs, "where"> & { where?: W }) =>
      run(p => p.programmingChecklistItem.aggregate({ ...args, where: org(args?.where) })),
  };
}

function scopedTransaction(orgId: number, run: Run) {
  type W = Prisma.TransactionWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.TransactionWhereUniqueInput): Promise<number> {
    const row = await run(p => p.transaction.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.TransactionFindManyArgs)  => run(p => p.transaction.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.TransactionFindFirstArgs) => run(p => p.transaction.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.TransactionFindUniqueArgs) => run(p => p.transaction.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.TransactionCreateArgs, "data"> & { data: Omit<Prisma.TransactionUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.transaction.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.TransactionUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.transaction.update({ ...args, where: { id } }));
    },
    updateMany: (args: Omit<Prisma.TransactionUpdateManyArgs, "where"> & { where?: W }) =>
      run(p => p.transaction.updateMany({ ...args, where: org(args.where) })),
    delete:     async (args: Prisma.TransactionDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.transaction.delete({ where: { id } }));
    },
    count:      (args?: Prisma.TransactionCountArgs)     => run(p => p.transaction.count({ ...args, where: org(args?.where) })),
    aggregate:  (args: Omit<Prisma.TransactionAggregateArgs, "where"> & { where?: W }) =>
      run(p => p.transaction.aggregate({ ...args, where: org(args?.where) })),
    // groupBy: org filter injected into where so a cross-org row can't contribute
    // to any group. Prisma's groupBy generic is too elaborate to thread the org
    // injection through without fighting the conditional types, so we re-inject
    // `where` then cast back to the delegate's own signature — the runtime shape
    // is identical and the caller's args/return types are preserved via the cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    groupBy:    ((args: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      run(p => p.transaction.groupBy({ ...args, where: org(args?.where) }))) as any as typeof prisma.transaction.groupBy,
  };
}

function scopedBudget(orgId: number, run: Run) {
  type W = Prisma.BudgetWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.BudgetWhereUniqueInput): Promise<number> {
    const row = await run(p => p.budget.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.BudgetFindManyArgs)  => run(p => p.budget.findMany({ ...args, where: org(args?.where) })),
    // Generic so an include (e.g. allocations) flows through to the result type.
    findFirst:  <T extends Prisma.BudgetFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.BudgetFindFirstArgs>) =>
      run(p => p.budget.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.BudgetFindFirstArgs>)),
    findUnique: (args: Prisma.BudgetFindUniqueArgs) => run(p => p.budget.findFirst({ ...args, where: org(args.where as W) })),
    /**
     * Org-safe findUnique with allocations. The @@unique([organizationId, semester])
     * key is already org-scoped. Omits the *Cents BigInt mirror columns: they
     * can't be JSON-serialized (Response.json → JSON.stringify throws on BigInt)
     * and no consumer reads them — `carryoverBalance`/`reserveAmount` (Float)
     * are the values the UI and DTOs use.
     */
    findUniqueWithAllocations: (semester: string) =>
      run(p => p.budget.findUnique({
        where: { organizationId_semester: { organizationId: orgId, semester } },
        include: { allocations: true },
        omit: { carryoverBalanceCents: true, reserveAmountCents: true },
      })),
    create:     (args: Omit<Prisma.BudgetCreateArgs, "data"> & { data: Omit<Prisma.BudgetUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.budget.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.BudgetUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.budget.update({ ...args, where: { id } }));
    },
    /** upsert is safe: @@unique([organizationId, semester]) requires callers to pass ctx.orgId in the where clause. */
    upsert:     (args: Prisma.BudgetUpsertArgs) => run(p => p.budget.upsert(args)),
    delete:     async (args: Prisma.BudgetDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.budget.delete({ where: { id } }));
    },
    count:      (args?: Prisma.BudgetCountArgs)     => run(p => p.budget.count({ ...args, where: org(args?.where) })),
  };
}

function scopedActivityLog(orgId: number, run: Run) {
  type W = Prisma.ActivityLogWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    // Generic so an include (e.g. actor) flows through to the result type.
    findMany:   <T extends Prisma.ActivityLogFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.ActivityLogFindManyArgs>) =>
      run(p => p.activityLog.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.ActivityLogFindManyArgs>)),
    findFirst:  (args?: Prisma.ActivityLogFindFirstArgs) => run(p => p.activityLog.findFirst({ ...args, where: org(args?.where) })),
    create:     (args: Omit<Prisma.ActivityLogCreateArgs, "data"> & { data: Omit<Prisma.ActivityLogUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.activityLog.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    count:      (args?: Prisma.ActivityLogCountArgs)     => run(p => p.activityLog.count({ ...args, where: org(args?.where) })),
  };
}

function scopedBrotherRole(orgId: number, run: Run) {
  type W = Prisma.BrotherRoleWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  // BrotherRole PK is (brotherId, roleId). Ownership verification confirms that
  // the row's organizationId matches this context before any mutation.
  async function verifyComposite(brotherId: number, roleId: number): Promise<void> {
    const row = await run(p => p.brotherRole.findFirst({
      where: { brotherId, roleId, organizationId: orgId },
      select: { brotherId: true },
    }));
    if (!row) notInOrg();
  }

  return {
    findMany: (args?: Prisma.BrotherRoleFindManyArgs) =>
      run(p => p.brotherRole.findMany({ ...args, where: org(args?.where) })),
    count: (args?: Prisma.BrotherRoleCountArgs) =>
      run(p => p.brotherRole.count({ ...args, where: org(args?.where) })),
    /**
     * Member count per role, batched into ONE groupBy instead of N per-role
     * COUNT() round-trips (the listRoles N+1). Org-scoped exactly like count():
     * the same `organizationId: orgId` filter is injected, so the result is
     * identical to summing per-role counts. Returns a Map(roleId → count);
     * roles with zero members are simply absent (callers default to 0).
     */
    countByRole: async (roleIds: number[]): Promise<Map<number, number>> => {
      if (roleIds.length === 0) return new Map();
      const rows = await run(p => p.brotherRole.groupBy({
        by: ["roleId"],
        where: org({ roleId: { in: roleIds } }),
        _count: { roleId: true },
      }));
      return new Map(rows.map((r: { roleId: number; _count: { roleId: number } }) => [r.roleId, r._count.roleId]));
    },
    /**
     * Role assignments (with role summary) for a set of brothers in this org.
     * Named method because the wrapper's findMany signature is not generic, so
     * a relation `select` wouldn't narrow the return type. Same org filter as
     * findMany — organizationId is injected, never taken from the caller.
     */
    listWithRole: (brotherIds: number[]) =>
      run(p => p.brotherRole.findMany({
        where: org({ brotherId: { in: brotherIds } }),
        select: { brotherId: true, role: { select: { id: true, name: true, color: true, rank: true } } },
      })),
    create: (args: Omit<Prisma.BrotherRoleCreateArgs, "data"> & { data: Omit<Prisma.BrotherRoleUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.brotherRole.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    delete: async (args: Prisma.BrotherRoleDeleteArgs) => {
      const { brotherId, roleId } = (args.where as { brotherId_roleId: { brotherId: number; roleId: number } }).brotherId_roleId;
      await verifyComposite(brotherId, roleId);
      return run(p => p.brotherRole.delete(args));
    },
  };
}

function scopedOrgMetricDefinition(orgId: number, run: Run) {
  type W = Prisma.OrgMetricDefinitionWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.OrgMetricDefinitionWhereUniqueInput): Promise<number> {
    const row = await run(p => p.orgMetricDefinition.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.OrgMetricDefinitionFindManyArgs)  => run(p => p.orgMetricDefinition.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.OrgMetricDefinitionFindFirstArgs) => run(p => p.orgMetricDefinition.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.OrgMetricDefinitionFindUniqueArgs) => run(p => p.orgMetricDefinition.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.OrgMetricDefinitionCreateArgs, "data"> & { data: Omit<Prisma.OrgMetricDefinitionUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.orgMetricDefinition.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.OrgMetricDefinitionUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.orgMetricDefinition.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.OrgMetricDefinitionDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.orgMetricDefinition.delete({ where: { id } }));
    },
    count:      (args?: Prisma.OrgMetricDefinitionCountArgs) => run(p => p.orgMetricDefinition.count({ ...args, where: org(args?.where) })),
  };
}

function scopedBrotherMetricValue(orgId: number, run: Run) {
  type W = Prisma.BrotherMetricValueWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.BrotherMetricValueWhereUniqueInput): Promise<number> {
    const row = await run(p => p.brotherMetricValue.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.BrotherMetricValueFindManyArgs)  => run(p => p.brotherMetricValue.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.BrotherMetricValueFindFirstArgs) => run(p => p.brotherMetricValue.findFirst({ ...args, where: org(args?.where) })),
    create:     (args: Omit<Prisma.BrotherMetricValueCreateArgs, "data"> & { data: Omit<Prisma.BrotherMetricValueUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.brotherMetricValue.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    upsert:     (args: Prisma.BrotherMetricValueUpsertArgs) => run(p => p.brotherMetricValue.upsert(args)),
    update:     async (args: Prisma.BrotherMetricValueUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.brotherMetricValue.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.BrotherMetricValueDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.brotherMetricValue.delete({ where: { id } }));
    },
    count:      (args?: Prisma.BrotherMetricValueCountArgs) => run(p => p.brotherMetricValue.count({ ...args, where: org(args?.where) })),
    /**
     * Value sum + avg per metric definition, batched into ONE groupBy.
     * Org-scoped via the injected organizationId filter. Returns a Map of
     * metricDefinitionId → { _avg, _sum, _count }; definitions with no values
     * are absent (callers should default). Mirrors countByRole pattern.
     */
    aggregateByDefinition: async (defIds: number[]) => {
      if (defIds.length === 0) return new Map<number, { avg: number | null; sum: number; count: number }>();
      const rows = await run(p => p.brotherMetricValue.groupBy({
        by: ["metricDefinitionId"],
        where: org({ metricDefinitionId: { in: defIds } }),
        _avg:   { value: true },
        _sum:   { value: true },
        _count: { value: true },
      }));
      return new Map(rows.map((r: { metricDefinitionId: number; _avg: { value: number | null }; _sum: { value: number | null }; _count: { value: number } }) => [
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
          const n = await run(p => p.brotherMetricValue.count({
            where: org({ metricDefinitionId: d.id, value: { gte: d.goal } }),
          }));
          return [d.id, n] as [number, number];
        }),
      );
      return new Map(entries);
    },
  };
}

function scopedChapterAnnouncement(orgId: number, run: Run) {
  type W = Prisma.ChapterAnnouncementWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ChapterAnnouncementWhereUniqueInput): Promise<number> {
    const row = await run(p => p.chapterAnnouncement.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ChapterAnnouncementFindManyArgs)  => run(p => p.chapterAnnouncement.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.ChapterAnnouncementFindFirstArgs) => run(p => p.chapterAnnouncement.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.ChapterAnnouncementFindUniqueArgs) => run(p => p.chapterAnnouncement.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.ChapterAnnouncementCreateArgs, "data"> & { data: Omit<Prisma.ChapterAnnouncementUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.chapterAnnouncement.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.ChapterAnnouncementUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.chapterAnnouncement.update({ ...args, where: { id } }));
    },
    /** upsert is safe: @@unique([organizationId]) is the only valid unique selector, so callers must pass ctx.orgId. */
    upsert:     (args: Prisma.ChapterAnnouncementUpsertArgs) => run(p => p.chapterAnnouncement.upsert(args)),
    delete:     async (args: Prisma.ChapterAnnouncementDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.chapterAnnouncement.delete({ where: { id } }));
    },
  };
}

function scopedOrgInvite(orgId: number, run: Run) {
  type W = Prisma.OrgInviteWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.OrgInviteWhereUniqueInput): Promise<number> {
    const row = await run(p => p.orgInvite.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.OrgInviteFindManyArgs)  => run(p => p.orgInvite.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.OrgInviteFindFirstArgs) => run(p => p.orgInvite.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.OrgInviteFindUniqueArgs) => run(p => p.orgInvite.findFirst({ ...args, where: org(args.where as W) })),
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
      const rows = await run(p => p.inviteRedemption.groupBy({
        by: ["inviteId"],
        where: { inviteId: { in: inviteIds } },
        _count: { inviteId: true },
      }));
      return new Map(rows.map((r: { inviteId: number; _count: { inviteId: number } }) => [r.inviteId, r._count.inviteId]));
    },
    create:     (args: Omit<Prisma.OrgInviteCreateArgs, "data"> & { data: Omit<Prisma.OrgInviteUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.orgInvite.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.OrgInviteUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.orgInvite.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.OrgInviteDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.orgInvite.delete({ where: { id } }));
    },
    count:      (args?: Prisma.OrgInviteCountArgs)     => run(p => p.orgInvite.count({ ...args, where: org(args?.where) })),
  };
}

function scopedOrganizationConfig(orgId: number, run: Run) {
  // OrganizationConfig has a 1:1 relation to Organization with organizationId
  // @unique, so every operation is selected by organizationId directly — there
  // is exactly one row per org. No id-based verify() dance is needed because
  // organizationId is itself the org-scoping filter AND a valid unique selector.
  return {
    find: () =>
      run(p => p.organizationConfig.findUnique({ where: { organizationId: orgId } })),
    update: (data: Prisma.OrganizationConfigUpdateInput) =>
      run(p => p.organizationConfig.update({ where: { organizationId: orgId }, data })),
    /**
     * Create-or-update the single config row for this org. Used so a legacy org
     * whose config row was somehow never provisioned still gets one rather than
     * throwing P2025 on update. organizationId is injected, never taken from the
     * caller, so it can't be spoofed across tenants.
     */
    upsert: (data: { enabledWorkflows?: string[]; vocabularyOverrides?: Record<string, string>; thresholds?: Prisma.InputJsonValue; disabledFeatures?: Prisma.InputJsonValue; customMemberFields?: Prisma.InputJsonValue; navOrder?: string[]; onboardingCompletedAt?: Date }) =>
      run(p => p.organizationConfig.upsert({
        where:  { organizationId: orgId },
        update: data,
        create: { organizationId: orgId, ...data },
      })),
  };
}

function scopedReimbursement(orgId: number, run: Run) {
  type W = Prisma.ReimbursementWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ReimbursementWhereUniqueInput): Promise<number> {
    const row = await run(p => p.reimbursement.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ReimbursementFindManyArgs)  => run(p => p.reimbursement.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.ReimbursementFindFirstArgs) => run(p => p.reimbursement.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.ReimbursementFindUniqueArgs) => run(p => p.reimbursement.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.ReimbursementCreateArgs, "data"> & { data: Omit<Prisma.ReimbursementUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.reimbursement.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.ReimbursementUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.reimbursement.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.ReimbursementDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.reimbursement.delete({ where: { id } }));
    },
    count:      (args?: Prisma.ReimbursementCountArgs)     => run(p => p.reimbursement.count({ ...args, where: org(args?.where) })),
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

function scopedAttendanceRecord(orgId: number, run: Run) {
  type W = Prisma.AttendanceRecordWhereInput;
  // Scope through the CalendarEvent parent (org-bound). The relation filter
  // narrows to records whose event belongs to this org regardless of the
  // caller's WHERE (calendarEventId, brotherId, semesterId, …).
  const org = (w?: W): W => ({ ...w, calendarEvent: { is: { organizationId: orgId } } });
  return {
    findMany: <T extends Prisma.AttendanceRecordFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.AttendanceRecordFindManyArgs>) =>
      run(p => p.attendanceRecord.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.AttendanceRecordFindManyArgs>)),
    findFirst: <T extends Prisma.AttendanceRecordFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.AttendanceRecordFindFirstArgs>) =>
      run(p => p.attendanceRecord.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.AttendanceRecordFindFirstArgs>)),
    // findUnique → findFirst: WhereUniqueInput can't carry a relation filter, so
    // a composite-key lookup (calendarEventId_brotherId) becomes a findFirst that
    // ANDs the same key fields with the org relation. Same T | null shape.
    findUnique: <T extends Prisma.AttendanceRecordFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.AttendanceRecordFindUniqueArgs>) =>
      run(p => p.attendanceRecord.findFirst<T & Prisma.AttendanceRecordFindFirstArgs>({ ...(args as object), where: org(flattenCompoundKey((args as { where?: Record<string, unknown> }).where) as W) } as Prisma.SelectSubset<T & Prisma.AttendanceRecordFindFirstArgs, Prisma.AttendanceRecordFindFirstArgs>)),
    count: (args?: Prisma.AttendanceRecordCountArgs) => run(p => p.attendanceRecord.count({ ...args, where: org(args?.where) })),
  };
}

function scopedAttendanceExcuse(orgId: number, run: Run) {
  type W = Prisma.AttendanceExcuseWhereInput;
  // Scope through the Brother parent (org-bound) — the same relation excuse-service
  // already used to close this IDOR by hand. Equivalent to calendarEvent scoping
  // since an excuse's brother and event are always in the same org.
  const org = (w?: W): W => ({ ...w, brother: { is: { organizationId: orgId } } });
  return {
    findMany: <T extends Prisma.AttendanceExcuseFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.AttendanceExcuseFindManyArgs>) =>
      run(p => p.attendanceExcuse.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.AttendanceExcuseFindManyArgs>)),
    findFirst: <T extends Prisma.AttendanceExcuseFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.AttendanceExcuseFindFirstArgs>) =>
      run(p => p.attendanceExcuse.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.AttendanceExcuseFindFirstArgs>)),
    findUnique: <T extends Prisma.AttendanceExcuseFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.AttendanceExcuseFindUniqueArgs>) =>
      run(p => p.attendanceExcuse.findFirst<T & Prisma.AttendanceExcuseFindFirstArgs>({ ...(args as object), where: org(flattenCompoundKey((args as { where?: Record<string, unknown> }).where) as W) } as Prisma.SelectSubset<T & Prisma.AttendanceExcuseFindFirstArgs, Prisma.AttendanceExcuseFindFirstArgs>)),
    // updateMany accepts WhereInput, so the org relation is injected directly.
    // A foreign-org excuse matches zero rows (count: 0) rather than being mutated.
    updateMany: (args: Omit<Prisma.AttendanceExcuseUpdateManyArgs, "where"> & { where?: W }) =>
      run(p => p.attendanceExcuse.updateMany({ ...args, where: org(args.where) })),
    count: (args?: Prisma.AttendanceExcuseCountArgs) => run(p => p.attendanceExcuse.count({ ...args, where: org(args?.where) })),
  };
}

function scopedBudgetAllocation(orgId: number, run: Run) {
  type W = Prisma.BudgetAllocationWhereInput;
  // Scope through the Budget parent (org-bound). No ctx.db read callers today —
  // writes go through budget-service's $transaction — but this keeps the delegate
  // fail-closed for any future read.
  const org = (w?: W): W => ({ ...w, budget: { is: { organizationId: orgId } } });
  return {
    findMany: <T extends Prisma.BudgetAllocationFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.BudgetAllocationFindManyArgs>) =>
      run(p => p.budgetAllocation.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.BudgetAllocationFindManyArgs>)),
    findFirst: <T extends Prisma.BudgetAllocationFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.BudgetAllocationFindFirstArgs>) =>
      run(p => p.budgetAllocation.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.BudgetAllocationFindFirstArgs>)),
    count: (args?: Prisma.BudgetAllocationCountArgs) => run(p => p.budgetAllocation.count({ ...args, where: org(args?.where) })),
  };
}

function scopedInviteRedemption(orgId: number, run: Run) {
  type W = Prisma.InviteRedemptionWhereInput;
  // Scope through the OrgInvite parent (org-bound). No ctx.db read callers today
  // (the count is computed via scopedOrgInvite.redemptionCountByInvite from
  // org-scoped invite ids), but fail-closed for any future read.
  const org = (w?: W): W => ({ ...w, invite: { is: { organizationId: orgId } } });
  return {
    findMany: <T extends Prisma.InviteRedemptionFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.InviteRedemptionFindManyArgs>) =>
      run(p => p.inviteRedemption.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.InviteRedemptionFindManyArgs>)),
    findFirst: <T extends Prisma.InviteRedemptionFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.InviteRedemptionFindFirstArgs>) =>
      run(p => p.inviteRedemption.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.InviteRedemptionFindFirstArgs>)),
    count: (args?: Prisma.InviteRedemptionCountArgs) => run(p => p.inviteRedemption.count({ ...args, where: org(args?.where) })),
  };
}

function scopedMembership(orgId: number, run: Run) {
  type W = Prisma.MembershipWhereInput;
  // Membership HAS an organizationId column, so it's scoped directly like the
  // first-class delegates. Reads are limited to this org's memberships; the
  // last-admin guard (membership-service) and any roster-by-membership read are
  // now org-safe by default instead of relying on a manual organizationId filter.
  const org = (w?: W): W => ({ ...w, organizationId: orgId });
  return {
    findMany: <T extends Prisma.MembershipFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.MembershipFindManyArgs>) =>
      run(p => p.membership.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.MembershipFindManyArgs>)),
    findFirst: <T extends Prisma.MembershipFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.MembershipFindFirstArgs>) =>
      run(p => p.membership.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.MembershipFindFirstArgs>)),
    count: (args?: Prisma.MembershipCountArgs) => run(p => p.membership.count({ ...args, where: org(args?.where) })),
    /**
     * Set this brother's display name *in this org*. Deliberately built on
     * updateMany, not update: a Brother with no Membership in this org (a
     * roster-only member added by an admin, who has no auth account) must be a
     * no-op returning { count: 0 } rather than a P2025 throw. Callers use that
     * count to decide whether to fall back to writing Brother.name — see
     * updateBrother in lib/services/brother-service.ts.
     *
     * organizationId is injected by org(), never taken from the caller, so this
     * can only ever touch the active org's membership row.
     */
    setName: (brotherId: number, name: string | null) =>
      run(p => p.membership.updateMany({ where: org({ brotherId }), data: { name } })),
  };
}

function scopedOrganization(orgId: number, run: Run) {
  // Organization is the tenant ROOT, not an org-scoped child: there is no
  // organizationId column — the row IS the org. "Scoping" means the only row a
  // request may touch is its own active org, so we force where.id = orgId on
  // every read/update. A caller can never select or mutate a different org's row.
  type W = Prisma.OrganizationWhereInput;
  return {
    findUnique: <T extends Prisma.OrganizationFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.OrganizationFindUniqueArgs>) =>
      run(p => p.organization.findFirst<T & Prisma.OrganizationFindFirstArgs>({ ...(args as object), where: { ...((args as { where?: W }).where), id: orgId } } as Prisma.SelectSubset<T & Prisma.OrganizationFindFirstArgs, Prisma.OrganizationFindFirstArgs>)),
    findFirst: <T extends Prisma.OrganizationFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.OrganizationFindFirstArgs>) =>
      run(p => p.organization.findFirst<T>({ ...(args as object), where: { ...((args as T | undefined)?.where), id: orgId } } as Prisma.SelectSubset<T, Prisma.OrganizationFindFirstArgs>)),
    update: (args: Omit<Prisma.OrganizationUpdateArgs, "where"> & { where?: Prisma.OrganizationWhereUniqueInput }) =>
      run(p => p.organization.update({ ...args, where: { id: orgId } })),
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

  // run wraps every scoped delegate call.  When RLS_SET_ORG_ID=1 it issues
  // SET LOCAL app.org_id inside an implicit transaction so enforcing RLS policies
  // see the tenant id; when OFF it is a transparent pass-through.
  const run = makeRun(orgId);

  return {
    // The resolved tenant id. Exposed so callers that drop into the raw `tx`
    // client inside $transaction (where org injection is manual) can reference it
    // without threading a separate orgId param alongside the scoped accessor.
    orgId,

    brother:             scopedBrother(orgId, run),
    role:                scopedRole(orgId, run),
    semester:            scopedSemester(orgId, run),
    calendarEvent:       scopedCalendarEvent(orgId, run),
    serviceEvent:        scopedServiceEvent(orgId, run),
    serviceParticipation: scopedServiceParticipation(orgId, run),
    partyEvent:          scopedPartyEvent(orgId, run),
    task:                scopedTask(orgId, run),
    taskAssignment:      scopedTaskAssignment(orgId, run),
    poll:                scopedPoll(orgId, run),
    pollOption:          scopedPollOption(orgId, run),
    pollAssignment:      scopedPollAssignment(orgId, run),
    pollVote:            scopedPollVote(orgId, run),
    instagramTask:       scopedInstagramTask(orgId, run),
    doc:                 scopedDoc(orgId, run),
    docFolder:           scopedDocFolder(orgId, run),
    programmingEvent:    scopedProgrammingEvent(orgId, run),
    programmingEventDoc: scopedProgrammingEventDoc(orgId, run),
    programmingChecklistItem: scopedProgrammingChecklistItem(orgId, run),
    transaction:         scopedTransaction(orgId, run),
    reimbursement:       scopedReimbursement(orgId, run),
    budget:              scopedBudget(orgId, run),
    activityLog:         scopedActivityLog(orgId, run),
    chapterAnnouncement: scopedChapterAnnouncement(orgId, run),

    brotherRole:          scopedBrotherRole(orgId, run),
    orgInvite:            scopedOrgInvite(orgId, run),
    organizationConfig:   scopedOrganizationConfig(orgId, run),
    orgMetricDefinition:  scopedOrgMetricDefinition(orgId, run),
    brotherMetricValue:   scopedBrotherMetricValue(orgId, run),

    // Org-column-less join tables: scoped via a required relation to an org-bound
    // parent (CalendarEvent / Brother / Budget / OrgInvite). Membership and the
    // Organization root are scoped directly. These were raw pass-throughs before
    // the F2 hardening — a bare id/brotherId WHERE used to return cross-org rows.
    attendanceRecord:    scopedAttendanceRecord(orgId, run),
    attendanceExcuse:    scopedAttendanceExcuse(orgId, run),
    attendanceExemption: scopedAttendanceExemption(orgId, run),
    budgetAllocation:    scopedBudgetAllocation(orgId, run),
    inviteRedemption:    scopedInviteRedemption(orgId, run),
    membership:          scopedMembership(orgId, run),
    organization:        scopedOrganization(orgId, run),

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
    //
    // Note on double-wrap: this $transaction path is independent of the `run`
    // wrapper above — it sets SET LOCAL itself, so there is no double-wrapping
    // even when RLS_SET_ORG_ID=1.
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

/**
 * Test-only factory. Builds the same scoped-delegate object as `db()` but uses
 * `client` instead of the production `prisma` singleton for all queries.
 *
 * Use this to exercise the Phase 2 SET LOCAL path against `appPrisma`
 * (NOBYPASSRLS) so enforcing RLS policies actually filter the results.
 * The `run` wrapper always behaves as if RLS_SET_ORG_ID=1 regardless of the
 * env flag, since the test needs the SET LOCAL path active.
 *
 * Do NOT use in production code — `db()` is the production entry point.
 */
export function _dbWithClient(orgId: number, client: P) {
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error(`_dbWithClient(): orgId must be a positive integer, got ${JSON.stringify(orgId)}`);
  }
  // Always use the SET LOCAL path so the test exercises the Phase 2 mechanism.
  const run = _makeRunForTest(orgId, client);
  return {
    orgId,
    brother:             scopedBrother(orgId, run),
    role:                scopedRole(orgId, run),
    semester:            scopedSemester(orgId, run),
    calendarEvent:       scopedCalendarEvent(orgId, run),
    serviceEvent:        scopedServiceEvent(orgId, run),
    serviceParticipation: scopedServiceParticipation(orgId, run),
    partyEvent:          scopedPartyEvent(orgId, run),
    task:                scopedTask(orgId, run),
    taskAssignment:      scopedTaskAssignment(orgId, run),
    poll:                scopedPoll(orgId, run),
    pollOption:          scopedPollOption(orgId, run),
    pollAssignment:      scopedPollAssignment(orgId, run),
    pollVote:            scopedPollVote(orgId, run),
    instagramTask:       scopedInstagramTask(orgId, run),
    doc:                 scopedDoc(orgId, run),
    docFolder:           scopedDocFolder(orgId, run),
    programmingEvent:    scopedProgrammingEvent(orgId, run),
    programmingEventDoc: scopedProgrammingEventDoc(orgId, run),
    programmingChecklistItem: scopedProgrammingChecklistItem(orgId, run),
    transaction:         scopedTransaction(orgId, run),
    reimbursement:       scopedReimbursement(orgId, run),
    budget:              scopedBudget(orgId, run),
    activityLog:         scopedActivityLog(orgId, run),
    chapterAnnouncement: scopedChapterAnnouncement(orgId, run),
    brotherRole:          scopedBrotherRole(orgId, run),
    orgInvite:            scopedOrgInvite(orgId, run),
    organizationConfig:   scopedOrganizationConfig(orgId, run),
    orgMetricDefinition:  scopedOrgMetricDefinition(orgId, run),
    brotherMetricValue:   scopedBrotherMetricValue(orgId, run),
    attendanceRecord:    scopedAttendanceRecord(orgId, run),
    attendanceExcuse:    scopedAttendanceExcuse(orgId, run),
    attendanceExemption: scopedAttendanceExemption(orgId, run),
    budgetAllocation:    scopedBudgetAllocation(orgId, run),
    inviteRedemption:    scopedInviteRedemption(orgId, run),
    membership:          scopedMembership(orgId, run),
    organization:        scopedOrganization(orgId, run),
    platformAdmin:       (client as typeof prisma).platformAdmin,
  };
}
