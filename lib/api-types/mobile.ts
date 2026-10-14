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
}

/** Body of the 426 any /api route answers a build below MobileConfig.minVersion. */
export interface AppUpdateRequired {
  error: string;
  code: "APP_UPDATE_REQUIRED";
  minVersion: string;
}
