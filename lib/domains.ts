/**
 * Canonical product-domain config — the single source of truth for "what host
 * is the platform, and what hosts are org subdomains."
 *
 * Everything here is config-driven so the platform can be pointed at any domain
 * (or none yet) WITHOUT a code change. Consumers:
 *   - lib/auth/org-resolution.ts (server: resolve org from the Host header)
 *   - app/**                     (UI: APP_NAME wordmark)
 *
 * ── Configuration (all optional; sensible localhost defaults) ───────────────
 *   NEXT_PUBLIC_ROOT_DOMAIN   The bare apex, e.g. "example.com". Org subdomains
 *                             live under it ("alpha.example.com"). Defaults to
 *                             "localhost" — the honest "no domain yet" state, so
 *                             dev just works and nothing assumes a domain you
 *                             don't own. Set this when you get a real domain.
 *   NEXT_PUBLIC_DOMAIN_ALIASES Comma-separated extra apexes that should resolve
 *                             the same way (e.g. an old domain during a rebrand,
 *                             or a *.vercel.app preview host). Optional.
 *   NEXT_PUBLIC_APP_NAME      Display name for the wordmark/footer. Defaults to
 *                             "ChaptOS". Branding text only — never affects
 *                             host resolution.
 *
 * All are NEXT_PUBLIC_ so the login page (browser) and org-resolution (server)
 * read the exact same values.
 */

function clean(v: string | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/** Display name for UI chrome. Not a host — pure branding. */
export const APP_NAME = (process.env.NEXT_PUBLIC_APP_NAME ?? "").trim() || "ChaptOS";

/**
 * The user-facing root domain, e.g. "example.com". Defaults to "localhost" when
 * unset so there's no hardcoded product domain anywhere. Drives apex/subdomain
 * detection (APEX_HOSTS, slugFromHost).
 */
export const ROOT_DOMAIN = clean(process.env.NEXT_PUBLIC_ROOT_DOMAIN) || "localhost";

/** Extra apex domains that resolve like ROOT_DOMAIN (rebrands, preview hosts). */
const DOMAIN_ALIASES: readonly string[] = clean(process.env.NEXT_PUBLIC_DOMAIN_ALIASES)
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

/**
 * Hosts that are the platform itself (NOT an org subdomain) — a slug is never
 * extracted from these. Derived entirely from config: every configured apex
 * plus its bare `www.`, and always localhost for local dev.
 */
export const APEX_HOSTS: ReadonlySet<string> = new Set(
  [ROOT_DOMAIN, ...DOMAIN_ALIASES].flatMap(d => [d, `www.${d}`]).concat("localhost"),
);

/** Leading labels that are infra/reserved, never an org slug. */
const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set(["www"]);

/**
 * Extract an org slug from a hostname, or null if the host is a platform apex,
 * an IP, or otherwise has no org subdomain. Used by org-resolution (server Host
 * header) to map a subdomain to its org.
 *
 * With ROOT_DOMAIN="example.com":
 *   "alpha.example.com"  → "alpha"
 *   "example.com"        → null   (apex)
 *   "www.example.com"    → null   (reserved)
 *   "localhost"          → null
 *   "127.0.0.1"          → null
 */
export function slugFromHost(rawHost: string): string | null {
  const host = clean(rawHost).split(":")[0]; // strip any :port
  if (!host) return null;
  if (APEX_HOSTS.has(host)) return null;

  const labels = host.split(".");
  // Need at least sub.domain.tld (3 labels) for a real subdomain. Bare hosts
  // and IPs (which have no meaningful subdomain) fall through to null.
  if (labels.length < 3) return null;

  const sub = labels[0];
  if (!sub || RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}
