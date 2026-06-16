import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../app/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _pgPoolRevision: string | undefined;
  // eslint-disable-next-line no-var
  var _prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var _prismaSchemaRevision: string | undefined;
}

/** Bump when Prisma schema changes so `next dev` hot reload gets a fresh client. */
const PRISMA_SCHEMA_REVISION = "instagram-drop-owner-20260615";
/** Bump when pool options change so `next dev` hot reload picks up new config. */
const POOL_REVISION = "pool-prewarm-2-20260612";

function clientSupportsCurrentSchema(client: PrismaClient | undefined): boolean {
  return !!client
    && "completed" in Prisma.PartyEventScalarFieldEnum
    && "id" in Prisma.ServiceEventScalarFieldEnum
    && "calendarEventId" in Prisma.ServiceEventScalarFieldEnum
    && "isAdmin" in Prisma.BrotherScalarFieldEnum
    && "actorId" in Prisma.ActivityLogScalarFieldEnum
    && "status" in Prisma.AttendanceExcuseScalarFieldEnum
    && "avatarUrl" in Prisma.BrotherScalarFieldEnum
    && "email" in Prisma.BrotherScalarFieldEnum
    && "isGhost" in Prisma.BrotherScalarFieldEnum
    && "id" in Prisma.DocScalarFieldEnum
    // Phase 0: tenancy models
    && "id" in Prisma.OrganizationScalarFieldEnum
    && "id" in Prisma.MembershipScalarFieldEnum
    && "id" in Prisma.PlatformAdminScalarFieldEnum
    && "organizationId" in Prisma.BrotherScalarFieldEnum
    && "logoUrl" in Prisma.OrganizationScalarFieldEnum
    && "owner" in Prisma.CalendarEventScalarFieldEnum
    && "status" in Prisma.CalendarEventScalarFieldEnum
    && "id" in Prisma.ProgrammingEventScalarFieldEnum
    && "id" in Prisma.ProgrammingEventDocScalarFieldEnum;
}

// Reuse pool and client across hot-reloads in dev; create once in prod.
// If POOL_REVISION changes, drain the old pool so the new options take effect without a restart.
const needsFreshPool = !globalThis._pgPool || globalThis._pgPoolRevision !== POOL_REVISION;
if (globalThis._pgPool && needsFreshPool) {
  globalThis._pgPool.end().catch(() => undefined);
  globalThis._pgPool = undefined;
  // A new pool means the cached Prisma client points at a dead one — discard it.
  globalThis._prisma = undefined;
}
const pool = globalThis._pgPool ?? new Pool({
  connectionString:        process.env.DATABASE_URL!,
  connectionTimeoutMillis: 20_000,  // Supabase pooler cold-starts can take 10s+
  idleTimeoutMillis:       30_000,  // release idle connections promptly on Vercel
  max:                     10,      // stay under Supabase free-tier connection limit
});

// Initialize app.org_id to '' on every new physical connection so the Phase
// 2.5 RLS policies default to "no rows" (NULLIF('', '') → NULL) for any query
// that hasn't explicitly set the var via db().$transaction(). Safe no-op when
// connecting as a BYPASSRLS role (postgres superuser) since those policies
// aren't evaluated anyway.
if (needsFreshPool) {
  pool.on("connect", client => {
    client.query("SET app.org_id = ''").catch(() => undefined);
  });
}

// Pre-warm connections so the first real request doesn't pay the cold-start
// penalty. Warm at least 2: OrgLayout (and other hot paths) fire two queries in
// parallel — org-config alongside auth — and if the pool has only one physical
// connection at that moment, both land on the same pg client. pg then emits a
// "client.query() while already executing a query" deprecation warning (it
// serializes them correctly today, but the pattern throws in pg@9). Two warm
// clients let each parallel query check out its own connection.
if (needsFreshPool) {
  void Promise.all([
    pool.query("SELECT 1").catch(() => undefined),
    pool.query("SELECT 1").catch(() => undefined),
  ]);
  // Drain the pool on graceful shutdown so in-flight queries finish cleanly
  process.once("SIGTERM", () => { pool.end().catch(() => undefined); });
}
const adapter = new PrismaPg(pool);
const cachedPrisma = globalThis._prisma;

// Prisma's generated model delegates can change while `next dev` keeps globals alive.
// Also rebuild if the pool was just recreated (cached client would reference the dead pool).
const needsFreshClient =
  !cachedPrisma ||
  needsFreshPool ||
  globalThis._prismaSchemaRevision !== PRISMA_SCHEMA_REVISION ||
  !clientSupportsCurrentSchema(cachedPrisma) ||
  !cachedPrisma.activityLog ||
  !cachedPrisma.transaction ||
  !cachedPrisma.semester ||
  !cachedPrisma.attendanceRecord ||
  !cachedPrisma.attendanceExcuse ||
  !cachedPrisma.serviceEvent ||
  !cachedPrisma.doc ||
  !cachedPrisma.organization ||
  !cachedPrisma.membership ||
  !cachedPrisma.platformAdmin;

export const prisma = needsFreshClient ? new PrismaClient({ adapter }) : cachedPrisma;

if (process.env.NODE_ENV !== "production") {
  globalThis._pgPool = pool;
  globalThis._pgPoolRevision = POOL_REVISION;
  globalThis._prisma = prisma;
  globalThis._prismaSchemaRevision = PRISMA_SCHEMA_REVISION;
}
