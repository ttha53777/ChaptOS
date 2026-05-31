/**
 * Slug validation rules for self-serve org creation.
 *
 * Pure module — no DB, no IO. Checks format + reserved list + profanity.
 * Uniqueness is the caller's responsibility (a DB query in the create-org
 * service).
 *
 * Rules:
 *   - 3..32 characters
 *   - lowercase a-z, 0-9, single hyphens
 *   - no leading/trailing hyphen, no consecutive hyphens
 *   - not in the reserved set (system routes, infra hosts, generic words)
 *   - not flagged by the profanity matcher (obscenity, English preset)
 *
 * The profanity matcher handles obfuscation (leetspeak, character substitution)
 * the hardcoded list can't, and we run it against the de-hyphenated slug so
 * "f-u-c-k" doesn't slip through by abusing the hyphen separator.
 */

// ---------------------------------------------------------------------------
// Reserved set
// ---------------------------------------------------------------------------

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

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

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  ...SYSTEM_ROUTES,
  ...INFRA_HOSTS,
  ...GENERIC_WORDS,
]);

// ---------------------------------------------------------------------------
// Profanity matcher
// ---------------------------------------------------------------------------

// Singleton — building the matcher costs a few ms. Lives at module scope so
// every call shares the same compiled state machine.
const profanityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * True if the input contains profanity per the English dataset, accounting
 * for leetspeak and character substitutions.
 *
 * We check both the raw slug AND the de-hyphenated form so an attacker can't
 * sneak past by splitting words ("f-u-c-k" → "fuck" after hyphen removal).
 */
export function containsProfanity(raw: string): boolean {
  const slug = raw.trim().toLowerCase();
  if (!slug) return false;
  if (profanityMatcher.hasMatch(slug)) return true;
  const flat = slug.replace(/-/g, "");
  if (flat !== slug && profanityMatcher.hasMatch(flat)) return true;
  return false;
}

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
  | "reserved"
  | "profane";

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
  if (containsProfanity(slug)) {
    // Generic message — we deliberately don't echo back which word matched.
    return { ok: false, issue: "profane", message: "That slug isn't allowed. Try a different one." };
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

// ---------------------------------------------------------------------------
// Variant generation (used when a slug is taken)
// ---------------------------------------------------------------------------

const VARIANT_SUFFIXES: readonly string[] = ["chapter", "team", "club", "hq"];

/**
 * Generate up to `limit` candidate variants for a slug, ordered by how
 * close they are to the original. The caller filters out variants that fail
 * format/reserved/profanity rules or that exist in the DB.
 *
 * Variants tried (in order):
 *   - <slug>-2, <slug>-3, <slug>-4    (numeric)
 *   - <slug>-<current-year>           (e.g. lpe-2026)
 *   - <slug>-chapter, -team, -club    (generic suffixes)
 *
 * The function is pure — caller wires in the uniqueness check.
 */
export function generateSlugVariants(
  base: string,
  options: { year?: number; limit?: number } = {},
): string[] {
  const trimmed = base.trim().toLowerCase();
  if (!trimmed) return [];
  const limit = options.limit ?? 5;
  const year  = options.year  ?? new Date().getFullYear();

  const candidates: string[] = [
    `${trimmed}-2`,
    `${trimmed}-3`,
    `${trimmed}-${year}`,
    ...VARIANT_SUFFIXES.map(s => `${trimmed}-${s}`),
    `${trimmed}-4`,
  ];

  // De-dupe, truncate to MAX, filter format-invalid candidates.
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const v = c.slice(0, MAX_SLUG_LEN);
    if (seen.has(v)) continue;
    seen.add(v);
    if (validateSlugFormat(v).ok) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}
