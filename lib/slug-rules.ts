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

// Words that read as part of the platform rather than someone's workspace.
//
// Orgs live under /org/<slug> (lib/org-paths.ts), so a slug can no longer
// shadow a top-level page — this list used to grow with every public page
// (/trust, /pricing, /seo-preview, …) and no longer has to. What remains is
// what would look like ours if it showed up in a URL or a subdomain
// (lib/domains.ts still resolves <slug>.chaptos.com), or would read as an
// official account page: chaptos.com/org/login, admin.chaptos.com.
const PLATFORM_WORDS: readonly string[] = [
  "admin", "api", "app", "auth", "callback", "create", "dashboard",
  "login", "logout", "settings", "signin", "signout", "signup", "welcome",
  "billing", "pricing", "trust", "privacy", "terms", "legal", "contact",
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
  ...PLATFORM_WORDS,
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
 * Greek letter → its English NAME. Used for a word written entirely in Greek,
 * which for this product's core demographic is the org's actual name: "ΣΦΕ" is
 * Sigma Phi Epsilon, and the slug founders write by hand is
 * "sigma-phi-epsilon" — not a phonetic "sphe" nobody would recognise.
 */
const GREEK_LETTER_NAMES: Readonly<Record<string, string>> = {
  α: "alpha",   β: "beta",    γ: "gamma",   δ: "delta",   ε: "epsilon",
  ζ: "zeta",    η: "eta",     θ: "theta",   ι: "iota",    κ: "kappa",
  λ: "lambda",  μ: "mu",      ν: "nu",      ξ: "xi",      ο: "omicron",
  π: "pi",      ρ: "rho",     σ: "sigma",   ς: "sigma",   τ: "tau",
  υ: "upsilon", φ: "phi",     χ: "chi",     ψ: "psi",     ω: "omega",
};

/**
 * Greek letter → its SOUND. Used inside a mixed word, where the letters are
 * being spelled with rather than named: "Σigma" is someone typing sigma with a
 * Greek sigma, so it must come out "sigma" and not "sigmaigma".
 */
const GREEK_PHONETIC: Readonly<Record<string, string>> = {
  α: "a",  β: "b",  γ: "g",  δ: "d",  ε: "e",
  ζ: "z",  η: "e",  θ: "th", ι: "i",  κ: "k",
  λ: "l",  μ: "m",  ν: "n",  ξ: "x",  ο: "o",
  π: "p",  ρ: "r",  σ: "s",  ς: "s",  τ: "t",
  υ: "y",  φ: "ph", χ: "ch", ψ: "ps", ω: "o",
};

const ALL_GREEK_WORD = /^\p{Script=Greek}+$/u;
const GREEK_CHAR = /\p{Script=Greek}/gu;

/**
 * Romanize the Greek in a name so it can survive the [a-z0-9] filter below.
 * Without this every all-Greek name slugs to "" — a founder typing their own
 * letters got no URL at all, which for a Greek-letter org is most of them.
 *
 * Whole-word Greek is spelled out by letter name; Greek mixed into a Latin word
 * is transliterated phonetically. See the two tables above for why the same
 * character resolves two ways.
 *
 *   "ΣΦΕ"       → "sigma phi epsilon"
 *   "Σigma Φi"  → "sigma phi"
 */
export function transliterateGreek(name: string): string {
  return name
    .split(/\s+/)
    .map(word => {
      // Decompose and drop the accents first. Greek tonos and dialytika are
      // orthography, not identity — "Ωμέγας" is the same six letters as
      // "Ωμεγας" — and an accented vowel that missed the tables below would
      // fall through to the [a-z0-9] filter and vanish from the slug entirely.
      const lower = word
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      if (ALL_GREEK_WORD.test(lower)) {
        return [...lower].map(ch => GREEK_LETTER_NAMES[ch] ?? ch).join(" ");
      }
      return lower.replace(GREEK_CHAR, ch => GREEK_PHONETIC[ch] ?? ch);
    })
    .join(" ");
}

/**
 * Derive a slug candidate from an org name. Romanizes Greek, lowercases,
 * replaces non-alphanum with hyphens, collapses runs, trims, truncates. Does not
 * check reserved or uniqueness — the form should run validateSlugFormat()
 * afterwards and the service should check the DB.
 *
 *   "Lambda Phi Epsilon" → "lambda-phi-epsilon"
 *   "  Foo!! Bar  "      → "foo-bar"
 *   "ΣΦΕ"                → "sigma-phi-epsilon"
 *   "AB"                 → "ab" (caller still needs to handle too-short)
 *
 * Deliberately still returns "" for a name with nothing romanizable in it at all
 * (CJK, emoji, "!!! ???"). That empty string is a real answer the UI acts on —
 * the name step says so and the blueprint's Build button stays disabled until a
 * URL is typed — and inventing a random slug here would hand someone a web
 * address they never chose and can't read.
 */
export function suggestSlug(name: string): string {
  return (
    transliterateGreek(name)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")   // strip diacritics
      .replace(/[^a-z0-9]+/g, "-")       // anything else → hyphen
      .replace(/-{2,}/g, "-")            // collapse runs
      .replace(/^-+|-+$/g, "")           // trim leading/trailing
      .slice(0, MAX_SLUG_LEN)
      // Re-trim AFTER the cut: truncating mid-word can land on a hyphen, and a
      // trailing hyphen fails SLUG_FORMAT — the suggestion would have been
      // rejected by the very validator it exists to satisfy.
      .replace(/-+$/, "")
  );
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
