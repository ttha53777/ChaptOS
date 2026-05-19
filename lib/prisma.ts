import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../app/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var _prismaSchemaRevision: string | undefined;
}

/** Bump when Prisma schema changes so `next dev` hot reload gets a fresh client. */
const PRISMA_SCHEMA_REVISION = "service-event-v1-20260519";

function clientSupportsCurrentSchema(client: PrismaClient | undefined): boolean {
  return !!client && "completed" in Prisma.PartyEventScalarFieldEnum && "id" in Prisma.ServiceEventScalarFieldEnum;
}

// Reuse pool and client across hot-reloads in dev; create once in prod
const pool = globalThis._pgPool ?? new Pool({
  connectionString:        process.env.DATABASE_URL!,
  connectionTimeoutMillis: 5_000,   // fail fast instead of hanging when DB is unreachable
  idleTimeoutMillis:       30_000,  // release idle connections promptly on Vercel
  max:                     10,      // stay under Supabase free-tier connection limit
});

// Pre-warm the connection so the first real request doesn't pay the cold-start penalty
if (!globalThis._pgPool) {
  pool.query("SELECT 1").catch(() => undefined);
  // Drain the pool on graceful shutdown so in-flight queries finish cleanly
  process.once("SIGTERM", () => { pool.end().catch(() => undefined); });
}
const adapter = new PrismaPg(pool);
const cachedPrisma = globalThis._prisma;

// Prisma's generated model delegates can change while `next dev` keeps globals alive.
const needsFreshClient =
  !cachedPrisma ||
  globalThis._prismaSchemaRevision !== PRISMA_SCHEMA_REVISION ||
  !clientSupportsCurrentSchema(cachedPrisma) ||
  !cachedPrisma.activityLog ||
  !cachedPrisma.transaction ||
  !cachedPrisma.semester ||
  !cachedPrisma.attendanceRecord ||
  !cachedPrisma.attendanceExcuse ||
  !cachedPrisma.serviceEvent;

export const prisma = needsFreshClient ? new PrismaClient({ adapter }) : cachedPrisma;

if (process.env.NODE_ENV !== "production") {
  globalThis._pgPool = pool;
  globalThis._prisma = prisma;
  globalThis._prismaSchemaRevision = PRISMA_SCHEMA_REVISION;
}
