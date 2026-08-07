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
 *   const roster = await db(orgId).member.listRoster();
 *
 * Note there is no `brother` delegate. The roster lives on Membership (one row
 * per person per org) and is reached through `.member`; `.identity` is the
 * narrow surface for the shared per-account Brother row. See scopedMember.
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

// ---------------------------------------------------------------------------
// The roster: ctx.db.member
// ---------------------------------------------------------------------------

/**
 * One person's roster spot, flattened for reading.
 *
 * `id` is the **brotherId**, never Membership.id. Every child table
 * (AttendanceRecord, DuesPayment, BrotherRole, PollVote, BrotherMetricValue, …)
 * is keyed by brotherId, and so is every client-facing DTO in app/data.ts, so
 * keeping brotherId as the roster identity is what let the roster move to
 * Membership without touching a single foreign key. `membershipId` is exposed
 * for the rare caller that needs the row itself.
 *
 * `name` is already resolved: this org's Membership.name, falling back to the
 * account-level Brother.name when it is null.
 */
export interface RosterRow {
  id:           number;
  membershipId: number;
  name:         string;
  role:         string;
  attendance:   number;
  duesOwed:     number;
  gpa:          number;
  serviceHours: number;
  customFields: Prisma.JsonValue;
  archivedAt:   Date | null;
  isOrgAdmin:   boolean;
  avatarUrl:    string | null;
  authUserId:   string | null;
  isGhost:      boolean;
  /** Only present when the caller asked for `fields: "contact"`. */
  email?:       string | null;
}

export interface ListRosterOptions {
  where?:         Prisma.MembershipWhereInput;
  orderBy?:       Prisma.MembershipOrderByWithRelationInput;
  /** Legacy `isGhost` accounts are excluded by default — see listGhostAccounts. */
  includeGhosts?: boolean;
  /**
   * "contact" adds `email` to every row. Off by default on purpose: the roster
   * read is fetched on every page for every user, and email is member PII that
   * almost no caller needs. See lib/services/brother-service.ts.
   */
  fields?:        "roster" | "contact";
}

/**
 * The roster delegate — org-scoped Membership, keyed by brotherId.
 *
 * This replaced `ctx.db.brother`, which scoped by Brother.organizationId (the
 * legacy home org) and therefore returned null — a 404 — for anyone whose
 * account was first created somewhere else. There is deliberately no `brother`
 * delegate any more: every "is this person on my roster, and what are their
 * numbers?" question goes through here, and the narrow identity surface below
 * handles the few writes that genuinely span orgs.
 */
function scopedMember(orgId: number, run: Run) {
  type W = Prisma.MembershipWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  /** Shared select for the flattened reads. */
  const rosterSelect = (contact: boolean) => ({
    id:           true,
    brotherId:    true,
    name:         true,
    isOrgAdmin:   true,
    role:         true,
    attendance:   true,
    duesOwed:     true,
    gpa:          true,
    serviceHours: true,
    archivedAt:   true,
    customFields: true,
    brother: {
      select: {
        name:       true,
        avatarUrl:  true,
        authUserId: true,
        isGhost:    true,
        ...(contact ? { email: true } : {}),
      },
    },
  }) satisfies Prisma.MembershipSelect;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flatten = (m: any, contact: boolean): RosterRow => ({
    id:           m.brotherId,
    membershipId: m.id,
    name:         m.name ?? m.brother.name,
    role:         m.role,
    attendance:   m.attendance,
    duesOwed:     m.duesOwed,
    gpa:          m.gpa,
    serviceHours: m.serviceHours,
    customFields: m.customFields,
    archivedAt:   m.archivedAt,
    isOrgAdmin:   m.isOrgAdmin,
    avatarUrl:    m.brother.avatarUrl,
    authUserId:   m.brother.authUserId,
    isGhost:      m.brother.isGhost,
    ...(contact ? { email: m.brother.email } : {}),
  });

  const self = {
    // ── Reads ───────────────────────────────────────────────────────────────

    findMany: <T extends Prisma.MembershipFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.MembershipFindManyArgs>) =>
      run(p => p.membership.findMany<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.MembershipFindManyArgs>)),
    findFirst: <T extends Prisma.MembershipFindFirstArgs>(args?: Prisma.SelectSubset<T, Prisma.MembershipFindFirstArgs>) =>
      run(p => p.membership.findFirst<T>({ ...(args as object), where: org((args as T | undefined)?.where) } as Prisma.SelectSubset<T, Prisma.MembershipFindFirstArgs>)),
    count:     (args?: Prisma.MembershipCountArgs) => run(p => p.membership.count({ ...args, where: org(args?.where) })),
    aggregate: (args: Omit<Prisma.MembershipAggregateArgs, "where"> & { where?: W }) =>
      run(p => p.membership.aggregate({ ...args, where: org(args?.where) })),

    /**
     * This person's raw roster row in this org, or null if they have none.
     *
     * The tenancy check. Replaces the ~30 `brother.findUnique({ where: { id } })`
     * calls that services used to make purely to prove "this id belongs to my
     * org" — each of which silently 404'd multi-org members.
     */
    findByBrotherId: (brotherId: number) =>
      run(p => p.membership.findFirst({ where: org({ brotherId }) })),

    /** As findByBrotherId, but flattened and name-resolved. */
    findRosterRow: async (brotherId: number, opts?: { fields?: "roster" | "contact" }): Promise<RosterRow | null> => {
      const contact = opts?.fields === "contact";
      const m = await run(p => p.membership.findFirst({ where: org({ brotherId }), select: rosterSelect(contact) }));
      return m ? flatten(m, contact) : null;
    },

    /** The roster. Ghosts excluded by default; archived members included, as before. */
    listRoster: async (opts?: ListRosterOptions): Promise<RosterRow[]> => {
      const contact = opts?.fields === "contact";
      const where = org({
        ...opts?.where,
        ...(opts?.includeGhosts ? {} : { brother: { is: { isGhost: false } } }),
      });
      const rows = await run(p => p.membership.findMany({
        where,
        orderBy: opts?.orderBy ?? { brotherId: "asc" },
        select:  rosterSelect(contact),
      }));
      return rows.map(m => flatten(m, contact));
    },

    /**
     * Just the brotherIds on this org's roster. For the many callers that only
     * need the eligible set (attendance rolls, recalc loops, metric sweeps).
     */
    listIds: async (where?: W): Promise<number[]> => {
      const rows = await run(p => p.membership.findMany({
        where:  org({ brother: { is: { isGhost: false } }, ...where }),
        select: { brotherId: true },
      }));
      return rows.map(r => r.brotherId);
    },

    /**
     * A WHERE fragment matching a name in this org, across BOTH name columns.
     *
     * Membership.name is nullable with a fallback to Brother.name, so matching
     * only one of them silently misses people. Every name lookup — the claim
     * flow's roster match, the AI's fuzzy member resolution — must go through
     * here or it will half-work.
     */
    nameFilter: (fragment: string, opts?: { exact?: boolean }): W => {
      const match = opts?.exact
        ? { equals:   fragment, mode: "insensitive" as const }
        : { contains: fragment, mode: "insensitive" as const };
      return {
        OR: [
          { name: match },
          // Only fall through to the account name when this org set none, so a
          // deliberate org-local rename can't be matched by the old name.
          { name: null, brother: { is: { name: match } } },
        ],
      };
    },

    /** nameFilter + listRoster, the combination every name search wants. */
    search: (fragment: string, opts?: { exact?: boolean; fields?: "roster" | "contact" }): Promise<RosterRow[]> =>
      self.listRoster({ where: self.nameFilter(fragment, opts), fields: opts?.fields }),

    // ── Writes ──────────────────────────────────────────────────────────────

    /**
     * Add a roster spot. organizationId is injected, never taken from the
     * caller. The Brother row must already exist — see approveJoinRequest, the
     * only path that creates one, which writes both inside one $transaction.
     */
    create: (args: { data: Omit<Prisma.MembershipUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.membership.create({ data: { ...args.data, organizationId: orgId } })),

    /**
     * Update this person's roster values in this org. Built on updateMany so the
     * org filter is a WHERE rather than a pre-verified id, then raises the same
     * P2025 every caller's error handling already maps to a 404 when the person
     * is not on this roster.
     */
    updateByBrotherId: async (brotherId: number, data: Prisma.MembershipUpdateInput) => {
      const { count } = await run(p => p.membership.updateMany({ where: org({ brotherId }), data }));
      if (count === 0) notInOrg();
      return run(p => p.membership.findFirst({ where: org({ brotherId }) }));
    },

    /** Batch form, for the recalc sweeps. Returns { count }; no P2025. */
    updateManyByBrotherIds: (brotherIds: number[], data: Prisma.MembershipUpdateInput) =>
      run(p => p.membership.updateMany({ where: org({ brotherId: { in: brotherIds } }), data })),

    /**
     * Conditional dues write: applies `data` only if `guard` still holds.
     *
     * The compare-and-set the ledger paths use to keep a balance from going
     * negative under concurrent payments. Exists as a named method because the
     * hand-written form is one dropped `organizationId` away from decrementing
     * the same person's balance in EVERY org they belong to — see the header on
     * onTx below.
     */
    compareAndSetDues: (brotherId: number, args: { guard?: W; data: Prisma.MembershipUpdateInput }) =>
      run(p => p.membership.updateMany({ where: org({ brotherId, ...args.guard }), data: args.data })),

    /** Remove this person's roster spot. Does NOT touch the Brother row. */
    deleteByBrotherId: async (brotherId: number) => {
      const { count } = await run(p => p.membership.deleteMany({ where: org({ brotherId }) }));
      if (count === 0) notInOrg();
      return count;
    },

    /**
     * Set this brother's display name *in this org*.
     *
     * Kept as an updateMany returning { count } for signature compatibility with
     * its existing call sites, though after Phase 2 every roster row has a
     * Membership, so count is 0 only when the person genuinely is not a member.
     */
    setName: (brotherId: number, name: string | null) =>
      run(p => p.membership.updateMany({ where: org({ brotherId }), data: { name } })),

    /**
     * Batch-resolve display names for the active org: each brother's
     * Membership.name here if set, else the account-level Brother.name passed
     * in as `name`. Companion to setName — same fallback rule, but for the many
     * read paths (attendance, excuses, roles, tasks, polls, ...) that join a
     * Brother and show their name without going through the roster read.
     * One query regardless of list size; a caller passing zero brothers (e.g.
     * an empty attendance bucket) skips the round trip entirely.
     */
    resolveNames: async (brothers: { id: number; name: string }[]): Promise<Map<number, string>> => {
      if (brothers.length === 0) return new Map();
      const overrides = await run(p => p.membership.findMany({
        where:  org({ brotherId: { in: brothers.map(b => b.id) }, name: { not: null } }),
        select: { brotherId: true, name: true },
      }));
      const overrideByBrotherId = new Map(overrides.map(m => [m.brotherId, m.name as string]));
      return new Map(brothers.map(b => [b.id, overrideByBrotherId.get(b.id) ?? b.name]));
    },

    /**
     * The same delegate, bound to a raw transaction client.
     *
     * Load-bearing, not a convenience. Roster writes inside `$transaction` used
     * to be hand-written against the raw client with a manual
     * `organizationId: ctx.orgId` in the WHERE. On the old Brother-backed model
     * forgetting it was survivable — a brother had exactly one row. On
     * Membership it is a money bug: `updateMany({ where: { brotherId } })`
     * without the org filter decrements that person's dues in EVERY chapter
     * they belong to. Going through the delegate makes the filter impossible to
     * omit.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onTx: (tx: any) => scopedMember(orgId, fn => fn(tx as P)),
  };

  return self;
}

// ---------------------------------------------------------------------------
// The account: ctx.db.identity
// ---------------------------------------------------------------------------

/**
 * The narrow Brother surface — identity, not roster.
 *
 * Brother is now one row per human, SHARED across every org they belong to, so
 * every write here crosses org boundaries by definition. That is legitimate for
 * exactly four things (an email backfill, an avatar refresh, unlinking an auth
 * account, the platform-admin flag) and illegitimate for everything else, so
 * this delegate exposes those four by name and offers no generic `update()`.
 * If you find yourself wanting one, the field you are reaching for almost
 * certainly belongs on Membership.
 *
 * Reads are membership-gated: you may only look up someone who is on your
 * roster. Writes then apply globally — which is the point, and why each is
 * named after what it does rather than hidden behind a data bag.
 */
function scopedIdentity(orgId: number, run: Run) {
  /** Proves the caller's org contains this person before touching the shared row. */
  async function requireMember(brotherId: number): Promise<number> {
    const m = await run(p => p.membership.findFirst({
      where:  { brotherId, organizationId: orgId },
      select: { brotherId: true },
    }));
    if (!m) notInOrg();
    return m.brotherId;
  }

  return {
    /** The shared identity row for someone on this roster, or null. */
    findByBrotherId: async (brotherId: number) => {
      const m = await run(p => p.membership.findFirst({
        where:  { brotherId, organizationId: orgId },
        select: { brother: true },
      }));
      return m?.brother ?? null;
    },

    /**
     * Create the identity row. Call inside approveJoinRequest's transaction,
     * paired with member.create — a Brother without a Membership is an orphan
     * nobody can see or clean up, and nothing would ever create the other half.
     */
    create: (args: { data: Omit<Prisma.BrotherUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.brother.create({ data: { ...args.data, organizationId: orgId } })),

    setEmail: async (brotherId: number, email: string | null) => {
      const id = await requireMember(brotherId);
      return run(p => p.brother.update({ where: { id }, data: { email } }));
    },

    setAvatarUrl: async (brotherId: number, avatarUrl: string | null) => {
      const id = await requireMember(brotherId);
      return run(p => p.brother.update({ where: { id }, data: { avatarUrl } }));
    },

    /** Severs the Google account link, leaving the roster row claimable again. */
    unlinkAuth: async (brotherId: number) => {
      const id = await requireMember(brotherId);
      return run(p => p.brother.update({ where: { id }, data: { authUserId: null } }));
    },

    setPlatformAdminFlag: async (brotherId: number, isAdmin: boolean) => {
      const id = await requireMember(brotherId);
      return run(p => p.brother.update({ where: { id }, data: { isAdmin } }));
    },

    /**
     * Hard-delete the identity row, cascading every child record.
     *
     * Only correct when this org is the person's LAST — the FK cascades from
     * 20260801000000_member_erasure_fks reach across orgs, so calling this on a
     * multi-org member erases their history everywhere. deleteBrother checks
     * that and calls member.deleteByBrotherId instead when they belong elsewhere.
     */
    deleteAccount: async (brotherId: number) => {
      const id = await requireMember(brotherId);
      return run(p => p.brother.delete({ where: { id } }));
    },

    /** The same delegate bound to a transaction client — see member.onTx. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onTx: (tx: any) => scopedIdentity(orgId, fn => fn(tx as P)),
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

    /** The same delegate bound to a transaction client — see member.onTx. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onTx: (tx: any) => scopedBrotherRole(orgId, fn => fn(tx as P)),
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

function scopedCalendarEventType(orgId: number, run: Run) {
  type W = Prisma.CalendarEventTypeWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.CalendarEventTypeWhereUniqueInput): Promise<number> {
    const row = await run(p => p.calendarEventType.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.CalendarEventTypeFindManyArgs)  => run(p => p.calendarEventType.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.CalendarEventTypeFindFirstArgs) => run(p => p.calendarEventType.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.CalendarEventTypeFindUniqueArgs) => run(p => p.calendarEventType.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.CalendarEventTypeCreateArgs, "data"> & { data: Omit<Prisma.CalendarEventTypeUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.calendarEventType.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.CalendarEventTypeUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.calendarEventType.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.CalendarEventTypeDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.calendarEventType.delete({ where: { id } }));
    },
    count:      (args?: Prisma.CalendarEventTypeCountArgs) => run(p => p.calendarEventType.count({ ...args, where: org(args?.where) })),
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

function scopedSubscription(orgId: number, run: Run) {
  // Like OrganizationConfig: one row per org with organizationId @unique, so
  // organizationId is simultaneously the scoping filter and a valid unique
  // selector — no id-based verify() dance needed.
  //
  // findFirst rather than findUnique is the read path because callers routinely
  // ask about an org that has no row yet (every org that has never opened the
  // billing page), and `null` is a meaningful answer meaning "free, never
  // converted" rather than an error.
  //
  // NOTE: this is the SIGNED-IN read/write path only. The Stripe webhook has no
  // org context to SET LOCAL and figurints_app is NOBYPASSRLS, so webhook writes
  // must go through prismaPrivileged — see app/api/billing/webhook/route.ts.
  return {
    findFirst: (args?: Prisma.SubscriptionFindFirstArgs) =>
      run(p => p.subscription.findFirst({ ...args, where: { ...args?.where, organizationId: orgId } })),
    update: (data: Prisma.SubscriptionUpdateInput) =>
      run(p => p.subscription.update({ where: { organizationId: orgId }, data })),
    /**
     * Create-or-update the single subscription row for this org. The create
     * branch is how a free org gets its row the first time anything asks about
     * billing; organizationId is injected, never taken from the caller.
     */
    upsert: (data: Omit<Prisma.SubscriptionUncheckedCreateInput, "organizationId">) =>
      run(p => p.subscription.upsert({
        where:  { organizationId: orgId },
        update: data,
        create: { organizationId: orgId, ...data },
      })),
  };
}

function scopedSalesLead(orgId: number, run: Run) {
  type W = Prisma.SalesLeadWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.SalesLeadWhereUniqueInput): Promise<number> {
    const row = await run(p => p.salesLead.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:  (args?: Prisma.SalesLeadFindManyArgs)  => run(p => p.salesLead.findMany({ ...args, where: org(args?.where) })),
    findFirst: (args?: Prisma.SalesLeadFindFirstArgs) => run(p => p.salesLead.findFirst({ ...args, where: org(args?.where) })),
    create:    (args: Omit<Prisma.SalesLeadCreateArgs, "data"> & { data: Omit<Prisma.SalesLeadUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.salesLead.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:    async (args: Prisma.SalesLeadUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.salesLead.update({ ...args, where: { id } }));
    },
    count:     (args?: Prisma.SalesLeadCountArgs)     => run(p => p.salesLead.count({ ...args, where: org(args?.where) })),
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

function scopedChatApproval(orgId: number, run: Run) {
  type W = Prisma.ChatApprovalWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.ChatApprovalWhereUniqueInput): Promise<number> {
    const row = await run(p => p.chatApproval.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.ChatApprovalFindManyArgs)  => run(p => p.chatApproval.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.ChatApprovalFindFirstArgs) => run(p => p.chatApproval.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.ChatApprovalFindUniqueArgs) => run(p => p.chatApproval.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.ChatApprovalCreateArgs, "data"> & { data: Omit<Prisma.ChatApprovalUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.chatApproval.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    delete:     async (args: Prisma.ChatApprovalDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.chatApproval.delete({ where: { id } }));
    },
    count:      (args?: Prisma.ChatApprovalCountArgs)     => run(p => p.chatApproval.count({ ...args, where: org(args?.where) })),
  };
}

/**
 * The join-request queue: people who opened an invite link and are waiting on an
 * officer.
 *
 * Deliberately offers no `create`. A request is only ever filed by someone with
 * no membership anywhere, so there is no org context to scope by and no ctx to
 * build — that path lives in lib/auth/join-request-submit.ts and goes through
 * prismaPrivileged, the same posture as the other pre-auth bootstrap routes.
 * Everything an OFFICER does (list, approve, reject) is org-scoped and belongs
 * here.
 */
function scopedJoinRequest(orgId: number, run: Run) {
  type W = Prisma.JoinRequestWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.JoinRequestWhereUniqueInput): Promise<number> {
    const row = await run(p => p.joinRequest.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.JoinRequestFindManyArgs)  => run(p => p.joinRequest.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.JoinRequestFindFirstArgs) => run(p => p.joinRequest.findFirst({ ...args, where: org(args?.where) })),
    /**
     * The queue, with each request's source link label joined in. A named method
     * because the wrapper's findMany signature is not generic, so an `include`
     * passed through it wouldn't narrow the return type — same reason
     * brotherRole.listWithRole exists. Oldest first: this is a queue, not a feed.
     */
    listPending: (status: string) =>
      run(p => p.joinRequest.findMany({
        where:   org({ status }),
        orderBy: { createdAt: "asc" },
        include: { invite: { select: { label: true } } },
      })),
    findUnique: (args: Prisma.JoinRequestFindUniqueArgs) => run(p => p.joinRequest.findFirst({ ...args, where: org(args.where as W) })),
    update:     async (args: Prisma.JoinRequestUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.joinRequest.update({ ...args, where: { id } }));
    },
    count:      (args?: Prisma.JoinRequestCountArgs)     => run(p => p.joinRequest.count({ ...args, where: org(args?.where) })),
    /** The same delegate bound to a transaction client — see member.onTx. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onTx: (tx: any) => scopedJoinRequest(orgId, fn => fn(tx as P)),
  };
}

function scopedDuesPayment(orgId: number, run: Run) {
  type W = Prisma.DuesPaymentWhereInput;
  const org = (w?: W): W => ({ ...w, organizationId: orgId });

  async function verify(where: Prisma.DuesPaymentWhereUniqueInput): Promise<number> {
    const row = await run(p => p.duesPayment.findFirst({ where: org(where as W), select: { id: true } }));
    if (!row) notInOrg();
    return row.id;
  }

  return {
    findMany:   (args?: Prisma.DuesPaymentFindManyArgs)  => run(p => p.duesPayment.findMany({ ...args, where: org(args?.where) })),
    findFirst:  (args?: Prisma.DuesPaymentFindFirstArgs) => run(p => p.duesPayment.findFirst({ ...args, where: org(args?.where) })),
    findUnique: (args: Prisma.DuesPaymentFindUniqueArgs) => run(p => p.duesPayment.findFirst({ ...args, where: org(args.where as W) })),
    create:     (args: Omit<Prisma.DuesPaymentCreateArgs, "data"> & { data: Omit<Prisma.DuesPaymentUncheckedCreateInput, "organizationId"> }) =>
      run(p => p.duesPayment.create({ ...args, data: { ...args.data, organizationId: orgId } })),
    update:     async (args: Prisma.DuesPaymentUpdateArgs) => {
      const id = await verify(args.where);
      return run(p => p.duesPayment.update({ ...args, where: { id } }));
    },
    delete:     async (args: Prisma.DuesPaymentDeleteArgs) => {
      const id = await verify(args.where);
      return run(p => p.duesPayment.delete({ where: { id } }));
    },
    count:      (args?: Prisma.DuesPaymentCountArgs)     => run(p => p.duesPayment.count({ ...args, where: org(args?.where) })),
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
  // Scope through the CalendarEvent parent, exactly like scopedAttendanceRecord
  // above. This used to scope through Brother instead, on the reasoning that an
  // excuse's brother and event are always in the same org — true only while a
  // person belonged to one org. Phase 2 broke it: a member whose account
  // originated in org A can now legitimately file an excuse for an org B event,
  // and the Brother filter would drop it from org B's reads — computing their
  // attendance denominator without their excuses and reporting them too low.
  const org = (w?: W): W => ({ ...w, calendarEvent: { is: { organizationId: orgId } } });
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

    // The roster (Membership-backed, keyed by brotherId) and the shared
    // identity row. There is deliberately no `brother` delegate: scoping a
    // roster read by Brother.organizationId is what made a multi-org member
    // invisible outside their first org.
    member:              scopedMember(orgId, run),
    identity:            scopedIdentity(orgId, run),
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
    duesPayment:         scopedDuesPayment(orgId, run),
    chatApproval:        scopedChatApproval(orgId, run),
    joinRequest:         scopedJoinRequest(orgId, run),
    subscription:        scopedSubscription(orgId, run),
    salesLead:           scopedSalesLead(orgId, run),
    budget:              scopedBudget(orgId, run),
    activityLog:         scopedActivityLog(orgId, run),
    chapterAnnouncement: scopedChapterAnnouncement(orgId, run),

    brotherRole:          scopedBrotherRole(orgId, run),
    orgInvite:            scopedOrgInvite(orgId, run),
    organizationConfig:   scopedOrganizationConfig(orgId, run),
    orgMetricDefinition:  scopedOrgMetricDefinition(orgId, run),
    brotherMetricValue:   scopedBrotherMetricValue(orgId, run),
    calendarEventType:    scopedCalendarEventType(orgId, run),

    // Org-column-less join tables: scoped via a required relation to an org-bound
    // parent (CalendarEvent / Budget / OrgInvite); the Organization root is
    // scoped directly. These were raw pass-throughs before the F2 hardening — a
    // bare id/brotherId WHERE used to return cross-org rows.
    attendanceRecord:    scopedAttendanceRecord(orgId, run),
    attendanceExcuse:    scopedAttendanceExcuse(orgId, run),
    attendanceExemption: scopedAttendanceExemption(orgId, run),
    budgetAllocation:    scopedBudgetAllocation(orgId, run),
    inviteRedemption:    scopedInviteRedemption(orgId, run),
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
    // The roster (Membership-backed, keyed by brotherId) and the shared
    // identity row. There is deliberately no `brother` delegate: scoping a
    // roster read by Brother.organizationId is what made a multi-org member
    // invisible outside their first org.
    member:              scopedMember(orgId, run),
    identity:            scopedIdentity(orgId, run),
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
    duesPayment:         scopedDuesPayment(orgId, run),
    chatApproval:        scopedChatApproval(orgId, run),
    joinRequest:         scopedJoinRequest(orgId, run),
    subscription:        scopedSubscription(orgId, run),
    salesLead:           scopedSalesLead(orgId, run),
    budget:              scopedBudget(orgId, run),
    activityLog:         scopedActivityLog(orgId, run),
    chapterAnnouncement: scopedChapterAnnouncement(orgId, run),
    brotherRole:          scopedBrotherRole(orgId, run),
    orgInvite:            scopedOrgInvite(orgId, run),
    organizationConfig:   scopedOrganizationConfig(orgId, run),
    orgMetricDefinition:  scopedOrgMetricDefinition(orgId, run),
    brotherMetricValue:   scopedBrotherMetricValue(orgId, run),
    calendarEventType:    scopedCalendarEventType(orgId, run),
    attendanceRecord:    scopedAttendanceRecord(orgId, run),
    attendanceExcuse:    scopedAttendanceExcuse(orgId, run),
    attendanceExemption: scopedAttendanceExemption(orgId, run),
    budgetAllocation:    scopedBudgetAllocation(orgId, run),
    inviteRedemption:    scopedInviteRedemption(orgId, run),
    organization:        scopedOrganization(orgId, run),
    platformAdmin:       (client as typeof prisma).platformAdmin,
  };
}
