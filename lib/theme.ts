/**
 * The signed-in app's theme — dusk (dark) or ivory (light).
 *
 * Same trick as lib/onboarding/create-theme.ts: the resolved theme lives on
 * <html> as data-theme, never in React state, so a server-rendered page can't
 * paint dusk and then flash to ivory at hydration. APP_THEME_BOOT runs as a
 * blocking inline script in the root layout's <head>; every themed token in
 * app/globals.css keys off `html[data-theme="ivory"]`.
 *
 * Pure on purpose (no React, no DOM) so the server layout can import the script
 * string and tests can pin the resolver without a DOM.
 *
 * Default is dusk, not the system setting: every existing member has only ever
 * seen the app dark, so light is something you opt into (or "system").
 */

export type AppTheme = "ivory" | "dusk";
export type AppThemePref = AppTheme | "system";

export const APP_THEME_STORAGE_KEY = "chaptos:theme:v1";

export function isAppThemePref(value: unknown): value is AppThemePref {
  return value === "ivory" || value === "dusk" || value === "system";
}

export function resolveAppTheme(stored: string | null | undefined, prefersDark: boolean): AppTheme {
  if (stored === "ivory" || stored === "dusk") return stored;
  if (stored === "system") return prefersDark ? "dusk" : "ivory";
  return "dusk";
}

/** Mirrors resolveAppTheme() — it runs before any module graph exists. */
export const APP_THEME_BOOT = `try{var v=localStorage.getItem(${JSON.stringify(APP_THEME_STORAGE_KEY)});if(v==="system")v=matchMedia("(prefers-color-scheme: dark)").matches?"dusk":"ivory";if(v!=="ivory")v="dusk";document.documentElement.dataset.theme=v}catch(e){document.documentElement.dataset.theme="dusk"}`;
