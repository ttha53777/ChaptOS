import { APP_UPDATE_REQUIRED, APP_VERSION_HEADER, isBelowMinimum, parseAppVersion } from "@/lib/app-version";
import type { AppUpdateRequired, MobileConfig } from "@/lib/api-types";

/**
 * A version from the environment, or null when unset. A value that doesn't
 * parse is also null — but loudly, because a typo'd MOBILE_MIN_VERSION would
 * otherwise silently stop protecting old builds from a breaking change.
 */
const warnedInvalid = new Set<string>();

function envVersion(name: "MOBILE_MIN_VERSION" | "MOBILE_LATEST_VERSION"): string | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  if (!parseAppVersion(raw)) {
    // Once per bad value — the proxy reads this on every /api request.
    if (!warnedInvalid.has(`${name}=${raw}`)) {
      warnedInvalid.add(`${name}=${raw}`);
      console.error(`${name}=${JSON.stringify(raw)} is not a version (expected e.g. "1.4.0"); ignoring it`);
    }
    return null;
  }
  return raw;
}

/** What GET /api/mobile/config reports. Read per call so an env change needs no code change. */
export function mobileConfig(): MobileConfig {
  return { minVersion: envVersion("MOBILE_MIN_VERSION"), latestVersion: envVersion("MOBILE_LATEST_VERSION") };
}

/**
 * The 426 for a native-app request below the supported floor, or null to let
 * it through. Requests with no x-app-version (the browser, server-to-server)
 * are never affected. /api/mobile/config is exempt so an outdated build can
 * still learn what it must update to.
 */
export function outdatedAppResponse(pathname: string, headers: Headers): Response | null {
  if (pathname === "/api/mobile/config") return null;
  const version = headers.get(APP_VERSION_HEADER);
  if (!version) return null;
  const minVersion = envVersion("MOBILE_MIN_VERSION");
  if (!minVersion || !isBelowMinimum(version, minVersion)) return null;
  const body: AppUpdateRequired = {
    error: "This version of the app is no longer supported. Update it to keep going.",
    code: APP_UPDATE_REQUIRED,
    minVersion,
  };
  return Response.json(body, { status: 426, headers: { "Cache-Control": "no-store" } });
}
