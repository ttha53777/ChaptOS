import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _prisma: PrismaClient | undefined;
}

// Reuse pool and client across hot-reloads in dev; create once in prod
const pool = globalThis._pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
export const prisma = globalThis._prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis._pgPool = pool;
  globalThis._prisma = prisma;
}
