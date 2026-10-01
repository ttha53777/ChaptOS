/**
 * The signed-in app's theme resolution (lib/theme.ts).
 *
 * Product rule: dusk unless the member chose otherwise — "ivory" is light,
 * "system" follows the OS. APP_THEME_BOOT is a hand-written script STRING that
 * duplicates resolveAppTheme (it runs before any module graph exists), so the
 * last block evaluates the real script and pins it to the resolver.
 */

import { describe, expect, it } from "vitest";
import { APP_THEME_BOOT, APP_THEME_STORAGE_KEY, isAppThemePref, resolveAppTheme } from "@/lib/theme";

const STORED = [null, undefined, "", "garbage", "IVORY", "ivory", "dusk", "system"] as const;

describe("resolveAppTheme", () => {
  it("defaults to dusk when nothing valid is stored, whatever the OS says", () => {
    for (const stored of [null, undefined, "", "garbage", "IVORY"]) {
      expect(resolveAppTheme(stored, false)).toBe("dusk");
      expect(resolveAppTheme(stored, true)).toBe("dusk");
    }
  });

  it("honours an explicit choice over the OS", () => {
    expect(resolveAppTheme("ivory", true)).toBe("ivory");
    expect(resolveAppTheme("dusk", false)).toBe("dusk");
  });

  it("follows the OS only for 'system'", () => {
    expect(resolveAppTheme("system", true)).toBe("dusk");
    expect(resolveAppTheme("system", false)).toBe("ivory");
  });

  it("recognises exactly the three preferences", () => {
    for (const v of ["ivory", "dusk", "system"]) expect(isAppThemePref(v)).toBe(true);
    for (const v of ["", "light", "dark", "IVORY", null, undefined, 1]) expect(isAppThemePref(v)).toBe(false);
  });
});

describe("APP_THEME_BOOT", () => {
  function runBoot(stored: string | null, prefersDark: boolean, throwOnStorage = false): string {
    const documentElement = { dataset: {} as Record<string, string> };
    const localStorage = {
      getItem(key: string) {
        if (throwOnStorage) throw new Error("SecurityError");
        return key === APP_THEME_STORAGE_KEY ? stored : null;
      },
    };
    const matchMedia = (q: string) => ({ matches: q.includes("dark") ? prefersDark : false });
    new Function("localStorage", "matchMedia", "document", APP_THEME_BOOT)(localStorage, matchMedia, { documentElement });
    return documentElement.dataset.theme!;
  }

  it("agrees with resolveAppTheme on every input", () => {
    for (const stored of STORED) {
      for (const prefersDark of [true, false]) {
        expect(runBoot(stored ?? null, prefersDark), `stored=${String(stored)} prefersDark=${prefersDark}`)
          .toBe(resolveAppTheme(stored, prefersDark));
      }
    }
  });

  it("falls back to dusk when localStorage throws (Safari private mode)", () => {
    expect(runBoot(null, false, true)).toBe("dusk");
  });
});
