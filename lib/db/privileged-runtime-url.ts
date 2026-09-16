import { runtimeDatabaseUrl } from "@/lib/db/runtime-url";

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
  if (direct) return runtimeDatabaseUrl(direct);

  return runtimeDatabaseUrl(env.DATABASE_URL);
}

/**
 * Is the resolved privileged URL actually the ordinary application role?
 *
 * The fallback chain above ends at DATABASE_URL, which on every correctly
 * configured deployment is the NOBYPASSRLS application role. That fallback is
 * a trap: forgetting DIRECT_URL in production doesn't fail at boot, it hands
 * the "privileged" client a role that RLS still applies to. Every caller then
 * runs without an app.org_id — so the enforcing org_isolation policies match
 * nothing, and the bootstrap reads return *empty* rather than erroring.
 *
 * Empty is the worst possible answer here. requireUser reads "no Brother" and
 * signs the user out of an org they belong to; the org guard shows a member
 * the needs-an-invite page. The database is healthy, the query "succeeds", and
 * the app quietly denies everyone.
 *
 * Detecting the role by name is deliberately a heuristic — we compare the
 * resolved privileged URL against DATABASE_URL rather than asking Postgres,
 * because this runs at module load where an await would be a new failure mode.
 * It catches the real misconfiguration (privileged silently == app role) and
 * stays quiet whenever the two genuinely differ.
 */
export function privilegedUrlIsAppRole(env: DatabaseEnv = process.env): boolean {
  if (env.PRIVILEGED_DATABASE_URL) return false;
  if (env.DIRECT_URL) return false;
  return !!env.DATABASE_URL;
}
