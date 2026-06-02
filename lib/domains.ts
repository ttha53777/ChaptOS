/**
 * Canonical product-domain config — the single source of truth for "what host
 * is the platform, and what hosts are org subdomains."
 *
 * Everything here is config-driven so the platform can be pointed at any domain
 * (or none yet) WITHOUT a code change. Three surfaces consume it and must agree:
 *   - lib/slug-extract.ts        (client: parse a pasted org URL)
 *   - lib/auth/org-resolution.ts (server: resolve org from the Host header)
 *   - app/login/page.tsx         (UI: render "<slug>.<domain>" branding)
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
 * unset so there's no hardcoded product domain anywhere. Drives both UI branding
 * ("<slug>.<ROOT_DOMAIN>") and apex/subdomain detection.
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

/**
 * Whether a real product domain is configured. False when ROOT_DOMAIN is the
 * "localhost" placeholder — UI uses this to avoid rendering nonsense like
 * "alpha.localhost" before a domain exists.
 */
export const HAS_REAL_DOMAIN = ROOT_DOMAIN !== "localhost";

/**
 * The host label to display for an org, e.g. "alpha.example.com". When no real
 * domain is configured yet, returns just the slug — so branding degrades
 * gracefully instead of showing "alpha.localhost".
 */
export function orgHostLabel(slug: string): string {
  return HAS_REAL_DOMAIN ? `${slug}.${ROOT_DOMAIN}` : slug;
}

/**
 * The suffix shown after a slug input, e.g. ".example.com". Empty when no real
 * domain is configured.
 */
export function domainSuffix(): string {
  return HAS_REAL_DOMAIN ? `.${ROOT_DOMAIN}` : "";
}

/** Leading labels that are infra/reserved, never an org slug. */
const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set(["www"]);

/**
 * Extract an org slug from a hostname, or null if the host is a platform apex,
 * an IP, or otherwise has no org subdomain. Shared by slug-extract (client URL
 * paste) and org-resolution (server Host header) so they can't disagree.
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
