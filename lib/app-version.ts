// Native-app version gating. Pure (no imports, no env) so the app bundles the
// same comparison the server enforces — the two can't disagree about whether
// "1.10.0" is newer than "1.9.3".

/** Header every native-app request carries: its own semver, e.g. "1.4.0". */
export const APP_VERSION_HEADER = "x-app-version";

/** `code` on the 426 an app below the supported minimum receives from any /api route. */
export const APP_UPDATE_REQUIRED = "APP_UPDATE_REQUIRED";

/**
 * "1.4.2" → [1, 4, 2]. Missing parts read as 0 ("1.4" is 1.4.0); a pre-release
 * or build suffix ("1.4.2-beta.1", "1.4.2+77") is ignored, so a beta of the
 * minimum counts as the minimum. Anything else is null — never guessed at.
 */
export function parseAppVersion(raw: string | null | undefined): [number, number, number] | null {
  const m = raw?.trim().match(/^(\d{1,6})(?:\.(\d{1,6}))?(?:\.(\d{1,6}))?(?:[-+].*)?$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

/** Negative when a < b, 0 when equal, positive when a > b. Null if either is unparseable. */
export function compareAppVersions(a: string, b: string): number | null {
  const pa = parseAppVersion(a);
  const pb = parseAppVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * True only when BOTH versions parse and `version` is strictly older. An
 * unparseable version is never treated as outdated: blocking a client over a
 * header we can't read would lock people out on our own bug, and a client too
 * old to send the header was never going to read a 426 anyway.
 */
export function isBelowMinimum(version: string | null | undefined, minimum: string | null | undefined): boolean {
  if (!version || !minimum) return false;
  const cmp = compareAppVersions(version, minimum);
  return cmp !== null && cmp < 0;
}
