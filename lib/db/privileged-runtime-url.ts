/**
 * Resolve the privileged connection used by the running application.
 *
 * DIRECT_URL deliberately points at Supabase's session pool (5432) because
 * Prisma migrations need session semantics. Serverless request handlers must
 * not use that endpoint: each Vercel isolate owns a pg.Pool, so a small burst
 * can exhaust Supabase's session-client limit. The same Supavisor host exposes
 * transaction pooling on 6543, which is appropriate for runtime queries.
 *
 * PRIVILEGED_DATABASE_URL is the explicit override for hosts where the pooled
 * privileged URL cannot be derived. It must use a BYPASSRLS database role.
 */
type DatabaseEnv = Record<string, string | undefined>;

export function privilegedRuntimeUrl(env: DatabaseEnv = process.env): string | undefined {
  if (env.PRIVILEGED_DATABASE_URL) return env.PRIVILEGED_DATABASE_URL;

  const direct = env.DIRECT_URL;
  if (direct) {
    try {
      const url = new URL(direct);
      if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432") {
        url.port = "6543";
        return url.toString();
      }
    } catch {
      // Let pg report a useful connection-string error below instead of
      // replacing it with a URL parsing failure here.
    }
    return direct;
  }

  return env.DATABASE_URL;
}
