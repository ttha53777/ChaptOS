/**
 * Convert Supabase's session-pool endpoint to its transaction-pool endpoint
 * for application runtime traffic.
 *
 * Vercel may run many isolated copies of the application. Each copy owns its
 * own `pg.Pool`, so using Supavisor's session endpoint (5432) can exhaust a
 * small project's client limit even when every individual pool is bounded.
 * Prisma CLI/migrations continue to use DIRECT_URL through prisma.config.ts.
 */
export function runtimeDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) return value;

  try {
    const url = new URL(value);
    if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432") {
      url.port = "6543";
      return url.toString();
    }
  } catch {
    // Preserve the original value so `pg` reports the connection-string error.
  }

  return value;
}
