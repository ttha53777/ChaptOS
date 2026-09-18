import { AsyncLocalStorage } from "node:async_hooks";
import { logError } from "@/lib/observability";
import { Pool } from "pg";
import type { db } from "@/lib/db";
import { runtimeDatabaseUrl } from "@/lib/db/runtime-url";

declare global { var _billingLockPool: Pool | undefined; }
const heldLock = new AsyncLocalStorage<number>();

/**
 * Serialize Stripe quantity writes across processes, including membership sync.
 * The dedicated one-connection pool holds ONLY the advisory lock. Domain writes
 * still use scoped delegates and commit before Stripe, preserving durable retry
 * flags. Borrowing a normal Prisma connection here would starve its two-slot
 * pool when two billing operations each hold a lock transaction and need a write.
 * Transaction-scoped locks also work behind Supabase's transaction pooler.
 */
export async function withBillingLock<T>(scoped: ReturnType<typeof db>, fn: () => Promise<T>): Promise<T> {
  if (heldLock.getStore() === scoped.orgId) return fn();
  const pool = globalThis._billingLockPool ??= new Pool({
    connectionString: runtimeDatabaseUrl(process.env.DATABASE_URL)!,
    max: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000, allowExitOnIdle: true,
  });
  if (pool.listenerCount("error") === 0) pool.on("error", error => logError(error, { route: "billing/lock" }));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(734922, $1::integer)", [scoped.orgId]);
    return await heldLock.run(scoped.orgId, fn);
  } finally {
    try { await client.query("ROLLBACK"); } finally { client.release(); }
  }
}
