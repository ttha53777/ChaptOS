import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { compareAppVersions, isBelowMinimum, parseAppVersion } from "@/lib/app-version";
import { mobileConfig, outdatedAppResponse } from "@/lib/mobile-config";
import { proxy } from "@/proxy";

const ENV = ["MOBILE_MIN_VERSION", "MOBILE_LATEST_VERSION"] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => { saved = Object.fromEntries(ENV.map(k => [k, process.env[k]])); ENV.forEach(k => delete process.env[k]); });
afterEach(() => { ENV.forEach(k => saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])); vi.restoreAllMocks(); });

describe("parseAppVersion / compareAppVersions", () => {
  it("parses full, short and suffixed semver", () => {
    expect(parseAppVersion("1.4.2")).toEqual([1, 4, 2]);
    expect(parseAppVersion("1.4")).toEqual([1, 4, 0]);
    expect(parseAppVersion(" 2 ")).toEqual([2, 0, 0]);
    expect(parseAppVersion("1.4.2-beta.1")).toEqual([1, 4, 2]);
    expect(parseAppVersion("1.4.2+77")).toEqual([1, 4, 2]);
  });
  it("refuses anything that isn't a version", () => {
    for (const bad of ["", "v1.2.3", "1.2.3.4", "1..2", "latest", "1.2.x", null, undefined]) {
      expect(parseAppVersion(bad as string)).toBeNull();
    }
  });
  it("compares numerically, not as strings", () => {
    expect(compareAppVersions("1.10.0", "1.9.3")).toBeGreaterThan(0);
    expect(compareAppVersions("1.4", "1.4.0")).toBe(0);
    expect(compareAppVersions("0.9.9", "1.0.0")).toBeLessThan(0);
    expect(compareAppVersions("nope", "1.0.0")).toBeNull();
  });
  it("only calls a version outdated when both parse and it is strictly older", () => {
    expect(isBelowMinimum("1.2.0", "1.3.0")).toBe(true);
    expect(isBelowMinimum("1.3.0", "1.3.0")).toBe(false);
    expect(isBelowMinimum("1.3.0-beta", "1.3.0")).toBe(false);
    expect(isBelowMinimum("garbage", "1.3.0")).toBe(false);
    expect(isBelowMinimum("1.0.0", null)).toBe(false);
    expect(isBelowMinimum(null, "1.0.0")).toBe(false);
  });
});

describe("mobileConfig", () => {
  it("reports nulls when unset", () => {
    expect(mobileConfig()).toEqual({ minVersion: null, latestVersion: null });
  });
  it("reports set versions, and drops (loudly, once) one that doesn't parse", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.MOBILE_MIN_VERSION = "1.2.0";
    process.env.MOBILE_LATEST_VERSION = "one point three";
    expect(mobileConfig()).toEqual({ minVersion: "1.2.0", latestVersion: null });
    mobileConfig();
    expect(err).toHaveBeenCalledTimes(1);
  });
});

describe("outdatedAppResponse", () => {
  const h = (v?: string) => new Headers(v ? { "x-app-version": v } : {});

  it("lets everything through when no floor is set", () => {
    expect(outdatedAppResponse("/api/tasks", h("0.0.1"))).toBeNull();
  });
  it("426s a build below the floor with a machine-readable body", async () => {
    process.env.MOBILE_MIN_VERSION = "1.2.0";
    const res = outdatedAppResponse("/api/tasks", h("1.1.9"));
    expect(res?.status).toBe(426);
    expect(await res?.json()).toEqual({ error: expect.any(String), code: "APP_UPDATE_REQUIRED", minVersion: "1.2.0" });
  });
  it("never touches the browser, a current build, an unreadable header, or the config route", () => {
    process.env.MOBILE_MIN_VERSION = "1.2.0";
    expect(outdatedAppResponse("/api/tasks", h())).toBeNull();
    expect(outdatedAppResponse("/api/tasks", h("1.2.0"))).toBeNull();
    expect(outdatedAppResponse("/api/tasks", h("banana"))).toBeNull();
    expect(outdatedAppResponse("/api/mobile/config", h("0.1.0"))).toBeNull();
  });
});

describe("proxy", () => {
  const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    new NextRequest(`https://chaptos.com${path}`, init);

  it("answers an outdated app's /api request with 426 before anything else runs", async () => {
    process.env.MOBILE_MIN_VERSION = "2.0.0";
    const res = await proxy(req("/api/tasks", { method: "POST", headers: { "x-app-version": "1.9.0" } }));
    expect(res.status).toBe(426);
  });
  it("passes a current app and the browser through, and still enforces CSRF", async () => {
    process.env.MOBILE_MIN_VERSION = "2.0.0";
    expect((await proxy(req("/api/tasks", { headers: { "x-app-version": "2.0.0" } }))).status).toBe(200);
    expect((await proxy(req("/api/tasks"))).status).toBe(200);
    const crossSite = await proxy(req("/api/tasks", { method: "POST", headers: { origin: "https://evil.example", "x-app-version": "2.0.0" } }));
    expect(crossSite.status).toBe(403);
  });
});
