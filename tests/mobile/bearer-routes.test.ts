import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRouteMap } from "../contracts/route-map";

// The native app has no cookie jar: every route it calls must identify the caller
// from `Authorization: Bearer` (getVerifiedAuthUser), never only from the
// Supabase session cookie. This is the static half of that promise: every
// route-map entry exists, exports its verb, and authenticates through a
// bearer-aware entry point. scripts/mobile-bearer-smoke.ts is the live half.

/** Bearer-aware ways a route may establish who's calling (all end in getVerifiedAuthUser). */
const BEARER_AWARE = ["buildContext(", "requireUser(", "getVerifiedAuthUser(", "getJoinSession(", "liveSession("];

/** No caller needed. invite-status reads a session when there is one, through getJoinSession. */
const PUBLIC = new Set(["GET /api/mobile/config", "GET /api/announcement"]);

const routes = readRouteMap();

describe("bearer-only route map", () => {
  it("parses the route map", () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it.each(routes.map(r => [`${r.method} ${r.path}`, r] as const))("%s", (_name, r) => {
    expect(existsSync(r.file), `${r.file} missing`).toBe(true);
    const src = readFileSync(r.file, "utf8");
    expect(src, `${r.method} not exported`).toMatch(new RegExp(`export (async function|const) ${r.method}\\b`));
    // Reading the identity off a cookie client is the cookie-only pattern bearer
    // requests fall through. (A cookie client used only to sign the browser out
    // afterwards, as DELETE /api/auth/account does, is fine.)
    expect(src, "reads the caller from the session cookie").not.toMatch(/\.auth\.(getUser|getSession)\(\s*\)/);
    if (PUBLIC.has(`${r.method} ${r.path}`)) return;
    expect(BEARER_AWARE.some(call => src.includes(call)), "no bearer-aware auth call").toBe(true);
  });
});
