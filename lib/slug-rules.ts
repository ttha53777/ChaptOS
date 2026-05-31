/**
 * Slug validation rules for self-serve org creation.
 *
 * Pure module — no DB, no IO. Checks format + reserved list. Uniqueness is the
 * caller's responsibility (a DB query in the create-org service).
 *
 * Rules:
 *   - 3..32 characters
 *   - lowercase a-z, 0-9, single hyphens
 *   - no leading/trailing hyphen, no consecutive hyphens
 *   - not in the reserved set
 *
 * The reserved set blocks:
 *   - System routes that would collide with Next.js paths (login, api, …).
 *   - Generic words that look like the app itself ("admin", "dashboard").
 *   - A minimal profanity baseline. Replace with a real library in Milestone 4.
 */

// ---------------------------------------------------------------------------
// Reserved set
// ---------------------------------------------------------------------------

// Next.js routes and infra hostnames. Anything under app/ becomes a path; if a
// future page named app/foo/ exists, /foo as an org slug would shadow it.
const SYSTEM_ROUTES: readonly string[] = [
  "admin", "api", "app", "auth", "callback", "chapter", "dashboard",
  "docs", "login", "logout", "settings", "signin", "signout", "signup",
  "welcome", "pending-access", "brothers", "timeline", "treasury",
  "service", "parties", "instagram",
];

const INFRA_HOSTS: readonly string[] = [
  "www", "mail", "ftp", "smtp", "imap", "ns", "ns1", "ns2", "cdn",
  "static", "assets", "blog", "help", "support", "status",
];

const GENERIC_WORDS: readonly string[] = [
  "home", "org", "team", "group", "club", "chapter", "fraternity",
  "sorority", "school", "university", "college",
];

// Minimal placeholder until a real profanity library replaces it in Milestone 4.
// Listing the common ones blocks the laziest abuse without being a moderation tool.
const PROFANITY: readonly string[] = [
  "fuck", "shit", "bitch", "ass", "asshole", "cunt", "dick", "piss",
  "nigger", "nigga", "faggot", "retard",
];

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  ...SYSTEM_ROUTES,
  ...INFRA_HOSTS,
  ...GENERIC_WORDS,
  ...PROFANITY,
]);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MIN_SLUG_LEN = 3;
export const MAX_SLUG_LEN = 32;

export type SlugIssue =
  | "empty"
  | "too-short"
  | "too-long"
  | "bad-format"
  | "reserved";

export interface SlugCheck {
  ok: boolean;
  /** First failing rule, or null when ok. */
  issue: SlugIssue | null;
  /** Human-readable explanation matching the issue. */
  message: string | null;
}

/**
 * Format + reserved-set check. Does NOT check uniqueness against the DB —
 * call this first to short-circuit, then query for collisions.
 *
 * Whitespace is trimmed but casing is preserved during the format check so
 * "Alpha" surfaces as bad-format rather than silently accepted — the UI should
 * either reject or call suggestSlug(raw) before re-validating.
 */
export function validateSlugFormat(raw: string): SlugCheck {
  const slug = raw.trim();
  if (slug.length === 0) {
    return { ok: false, issue: "empty", message: "Slug is required." };
  }
  if (slug.length < MIN_SLUG_LEN) {
    return { ok: false, issue: "too-short", message: `Slug must be at least ${MIN_SLUG_LEN} characters.` };
  }
  if (slug.length > MAX_SLUG_LEN) {
    return { ok: false, issue: "too-long", message: `Slug must be at most ${MAX_SLUG_LEN} characters.` };
  }
  if (!SLUG_FORMAT.test(slug)) {
    return {
      ok: false,
      issue: "bad-format",
      message: "Slug can only contain lowercase letters, numbers, and single hyphens.",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, issue: "reserved", message: "That slug is reserved. Try a different one." };
  }
  return { ok: true, issue: null, message: null };
}

// ---------------------------------------------------------------------------
// Suggestion
// ---------------------------------------------------------------------------

/**
 * Derive a slug candidate from an org name. Lowercases, replaces non-alphanum
 * with hyphens, collapses runs, trims, truncates. Does not check reserved or
 * uniqueness — the form should run validateSlugFormat() afterwards and the
 * service should check the DB.
 *
 *   "Lambda Phi Epsilon" → "lambda-phi-epsilon"
 *   "  Foo!! Bar  "      → "foo-bar"
 *   "AB"                 → "ab" (caller still needs to handle too-short)
 */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")     // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")         // anything else → hyphen
    .replace(/^-+|-+$/g, "")             // trim leading/trailing
    .replace(/-{2,}/g, "-")              // collapse runs
    .slice(0, MAX_SLUG_LEN);
}
