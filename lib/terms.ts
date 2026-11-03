/**
 * The Terms of Service, as data the rest of the app keys off.
 *
 * Pure and client-safe: /create, /join, the in-app TermsGate and the /terms page
 * all import this, so it must never import lib/db or anything server-only (see
 * the lib/ client-bundle boundary — a server import here 500s the dev server
 * while tsc stays green).
 *
 * A version is the date the text took effect, as YYYY-MM-DD. Publishing a new
 * version means: edit app/terms/page.tsx, append the date to TERMS_VERSIONS,
 * set TERMS_ACCEPT_BY (at least 30 days out for a material change, per section
 * 24 of the terms themselves), and replace TERMS_CHANGES with what changed.
 * Everyone whose latest acceptance is older then sees the TermsGate.
 */

/** Every version ever published, oldest first. The last one is current. */
export const TERMS_VERSIONS = ["2026-11-02"] as const;

export type TermsVersion = (typeof TERMS_VERSIONS)[number];

export const TERMS_VERSION: TermsVersion = TERMS_VERSIONS[TERMS_VERSIONS.length - 1]!;

/** The current version's effective date, as the page prints it. */
export const TERMS_EFFECTIVE_LABEL = "November 2, 2026";

/**
 * Until this date (YYYY-MM-DD, the viewer's local day) the in-app prompt can be
 * put off; from it on, the app waits for "I agree". The first publication gives
 * existing members the same 30 days a material change would.
 */
export const TERMS_ACCEPT_BY = "2026-12-02";

/**
 * What the in-app prompt lists for someone who accepted an earlier version. Empty
 * for the first publication: nobody has an earlier version to compare against,
 * so the prompt summarizes the terms instead.
 */
export const TERMS_CHANGES: readonly { section: string; text: string }[] = [];

/**
 * True for any version that was ever live. A page loaded before a new version
 * shipped still sends the one it showed, and that is what the person agreed to —
 * the prompt then asks them for the newer one.
 */
export function isKnownTermsVersion(v: unknown): v is TermsVersion {
  return typeof v === "string" && (TERMS_VERSIONS as readonly string[]).includes(v);
}
