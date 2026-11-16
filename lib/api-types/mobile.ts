// Native-app support shapes. Type-only: see lib/api-types/index.ts for the rules.

/**
 * GET /api/mobile/config — public, no auth. The app reads it at launch.
 * Versions are semver strings compared with lib/app-version.ts.
 */
export interface MobileConfig {
  /** Builds below this are refused (426) by every /api route. Null = no floor. */
  minVersion: string | null;
  /** The newest store build, for a soft "update available" nudge. Null = unknown. */
  latestVersion: string | null;
  /** Where the blocking "Update ChaptOS" screen sends people. Null until the listing exists. */
  iosStoreUrl: string | null;
  androidStoreUrl: string | null;
  /**
   * The current Terms of Service version (YYYY-MM-DD). The join screen sends it
   * as `termsVersion` before the person has a roster row (and so no
   * /api/auth/me TermsStatus to read it from).
   */
  termsVersion: string;
}

/** Body of the 426 any /api route answers a build below MobileConfig.minVersion. */
export interface AppUpdateRequired {
  error: string;
  code: "APP_UPDATE_REQUIRED";
  minVersion: string;
}
