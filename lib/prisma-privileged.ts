/**
 * Privileged Prisma client backed by a BYPASSRLS role.
 *
 * The connection string is resolved by privilegedRuntimeUrl(): the explicit
 * PRIVILEGED_DATABASE_URL if set, else DIRECT_URL, normalized to Supabase's
 * transaction pool (6543) for runtime traffic. DIRECT_URL itself still names
 * the session pool (5432) because Prisma migrations need session semantics.
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
 *   app/auth/callback + lib/auth/require-user
 *                               verified-account lookup before an org is known;
 *                               reads are keyed by authenticated user ID and
 *                               downstream access is membership-gated.
 *   lib/services/org-service.ts   provisioning + teardown (the original caller)
 *   instrumentation.ts            boot-time cross-org role-permission sweep
 *   app/api/admin/**             platform-admin cross-tenant reads. No active
 *                                 org means no app.org_id, and the billing
 *                                 tables have no permissive policy — the app
 *                                 role would return an empty result rather than
 *                                 an error, which reads as real data.
 *   lib/billing/webhook.ts        Stripe deliveries, which carry no session and
 *                                 no org cookie, so there is no app.org_id to
 *                                 SET LOCAL and the enforcing org_isolation
 *                                 policies on Subscription would reject the
 *                                 write. Same posture as the claim /
 *                                 redeem-invite bootstrap routes.
 *
 *   Do not widen this list casually — every entry is a place tenancy is enforced
 *   by code review rather than by the database.
 *
 * Implementation:
 *   Minimal, no hot-reload caching. provisionOrg is low-volume by nature
 *   (one call per new org), so the cost of a fresh client per next-dev edit
 *   doesn't matter. In production this module evaluates once.
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { privilegedRuntimeUrl, privilegedUrlIsAppRole } from "@/lib/db/privileged-runtime-url";

declare global {
  // eslint-disable-next-line no-var
  var _prismaPrivileged: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var _pgPoolPrivileged: Pool | undefined;
}

function build(): PrismaClient {
  const connectionString = privilegedRuntimeUrl();
  if (!connectionString) {
    throw new Error("prisma-privileged: no privileged database URL is set");
  }
  // Refuse to start in production on the app role. Under enforcing RLS this
  // client would not error — it would return empty result sets for every
  // bootstrap read, which the auth path cannot distinguish from "this account
  // has no identity". A member would be shown the needs-an-invite page and an
  // officer would lose their chapter, with nothing in the logs to explain it.
  //
  // Failing here is strictly better: it is loud, immediate, and names the fix.
  // Dev/test keep the fallback, where a single-role local Postgres is normal
  // and RLS bypass is not what is being exercised.
  if (process.env.NODE_ENV === "production" && privilegedUrlIsAppRole()) {
    throw new Error(
      "prisma-privileged: refusing to run as the application role. " +
      "Set DIRECT_URL (or PRIVILEGED_DATABASE_URL) to a BYPASSRLS role — " +
      "without it every auth-bootstrap read returns empty under enforcing RLS " +
      "and signs valid members out of their org."
    );
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
