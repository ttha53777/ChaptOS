/**
 * The /create flow's theme resolution.
 *
 * Two things are pinned here. First the product rule: an explicit stored choice
 * always wins, and with nothing stored the system decides — LIGHT when the
 * system has no preference, which is the whole reason the fallback isn't dusk.
 *
 * Second, and the reason this file matters: CREATE_THEME_BOOT is a hand-written
 * script STRING (it runs before any module graph exists, so it can't import
 * resolveCreateTheme). That duplication is the bug risk. The last block below
 * evaluates the real script body against a fake document/localStorage/matchMedia
 * and asserts it agrees with the resolver on every input.
 */

import { describe, expect, it } from "vitest";
import {
  CREATE_THEME_BOOT,
  CREATE_THEME_STORAGE_KEY,
  isCrfTheme,
  resolveCreateTheme,
  type CrfTheme,
} from "@/lib/onboarding/create-theme";

const STORED = [null, undefined, "", "garbage", "IVORY", "ivory", "dusk"] as const;

describe("isCrfTheme", () => {
  it("accepts only the two theme names", () => {
    expect(isCrfTheme("ivory")).toBe(true);
    expect(isCrfTheme("dusk")).toBe(true);
    for (const v of ["", "IVORY", "Dusk", "light", "dark", null, undefined, 1, {}]) {
      expect(isCrfTheme(v)).toBe(false);
    }
  });
});

describe("resolveCreateTheme", () => {
  it("honours a valid stored choice over the system preference", () => {
    expect(resolveCreateTheme("ivory", true)).toBe("ivory");
    expect(resolveCreateTheme("dusk", false)).toBe("dusk");
  });

  it("defaults to ivory when the system has no dark preference", () => {
    // matchMedia("(prefers-color-scheme: dark)").matches is false for BOTH
    // "system is light" and "system has no preference" — one expression covers
    // the product rule "light is the default when nobody has said otherwise".
    for (const stored of [null, undefined, "", "garbage", "IVORY"]) {
      expect(resolveCreateTheme(stored, false)).toBe("ivory");
    }
  });

  it("follows a dark system preference when nothing is stored", () => {
    for (const stored of [null, undefined, "", "garbage", "IVORY"]) {
      expect(resolveCreateTheme(stored, true)).toBe("dusk");
    }
  });

  it("always returns one of the two themes", () => {
    for (const stored of STORED) {
      for (const prefersDark of [true, false]) {
        expect(isCrfTheme(resolveCreateTheme(stored, prefersDark))).toBe(true);
      }
    }
  });
});

describe("CREATE_THEME_BOOT", () => {
  /** Run the real script body against a fake DOM, returning what it stamped. */
  function runBoot(stored: string | null, prefersDark: boolean, throwOnStorage = false): string {
    const documentElement = { dataset: {} as Record<string, string> };
    const scope = {
      localStorage: {
        getItem(key: string) {
          if (throwOnStorage) throw new Error("SecurityError");
          return key === CREATE_THEME_STORAGE_KEY ? stored : null;
        },
      },
      matchMedia: (q: string) => ({ matches: q.includes("dark") ? prefersDark : false }),
      document: { documentElement },
    };
    new Function("localStorage", "matchMedia", "document", CREATE_THEME_BOOT)(
      scope.localStorage,
      scope.matchMedia,
      scope.document,
    );
    return documentElement.dataset.crfTheme!;
  }

  it("reads the same storage key the app writes", () => {
    expect(CREATE_THEME_BOOT).toContain(CREATE_THEME_STORAGE_KEY);
  });

  it("agrees with resolveCreateTheme on every input", () => {
    for (const stored of STORED) {
      for (const prefersDark of [true, false]) {
        const viaScript = runBoot(stored ?? null, prefersDark);
        const viaResolver: CrfTheme = resolveCreateTheme(stored, prefersDark);
        expect(viaScript, `stored=${String(stored)} prefersDark=${prefersDark}`).toBe(viaResolver);
      }
    }
  });

  it("falls back to ivory when localStorage throws (Safari private mode)", () => {
    expect(runBoot(null, true, true)).toBe("ivory");
  });
});
