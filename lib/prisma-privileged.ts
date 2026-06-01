/**
 * Privileged Prisma client backed by DIRECT_URL (postgres superuser).
 *
 * Why this exists:
 *   The normal `prisma` client in lib/prisma.ts connects as the figurints_app
 *   role, which lacks BYPASSRLS and is therefore subject to the Phase 2.5
 *   org_isolation policies. That role cannot INSERT into Organization /
 *   OrganizationConfig during self-serve org provisioning — even with
 *   permissive WITH CHECK policies in place, Supabase's RLS layer rejects
 *   the write (root cause not fully diagnosed; documented behavior on
 *   Supabase RLS-enabled tables for non-postgres roles).
 *
 *   provisionOrg() runs once per new org, is pre-auth, and creates the very
 *   tenant boundary the rest of the system enforces. It's the same posture
 *   as /api/auth/claim: a bootstrap path that needs elevated DB privileges
 *   precisely because tenant context doesn't exist yet.
 *
 * Scope of use:
 *   Import ONLY from lib/services/org-service.ts. Do not use this in any
 *   other surface — that would defeat the tenancy enforcement design.
 *
 * Implementation:
 *   Minimal, no hot-reload caching. provisionOrg is low-volume by nature
 *   (one call per new org), so the cost of a fresh client per next-dev edit
 *   doesn't matter. In production this module evaluates once.
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var _prismaPrivileged: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var _pgPoolPrivileged: Pool | undefined;
}

function build(): PrismaClient {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("prisma-privileged: neither DIRECT_URL nor DATABASE_URL is set");
  }
  const pool = new Pool({
    connectionString,
    // Privileged client is rarely used (org-create only). Keep the pool small.
    max:                     2,
    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis:       30_000,
  });
  globalThis._pgPoolPrivileged = pool;
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prismaPrivileged: PrismaClient =
  globalThis._prismaPrivileged ?? build();

if (process.env.NODE_ENV !== "production") {
  globalThis._prismaPrivileged = prismaPrivileged;
}
