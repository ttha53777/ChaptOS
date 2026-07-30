/**
 * The /create flow's theme — ivory (light) or dusk (dark), chosen by the founder
 * and remembered across visits.
 *
 * The resolved theme lives on <html> as data-crf-theme, NOT on the React tree.
 * That is the whole trick: /create is server-rendered, so a theme React only
 * learns about at hydration would paint dusk first and flash. A blocking inline
 * script (CREATE_THEME_BOOT, rendered by app/create/page.tsx) stamps the
 * attribute before .crf is constructed, every themed selector in
 * app/create/create-flow.css keys off it, and React never renders it at all —
 * so a hydration mismatch is structurally impossible rather than suppressed.
 *
 * This module is deliberately pure: no React, no "use client", no DOM. The
 * server page imports the script string, the client hook imports the resolver,
 * and tests/onboarding/create-theme.test.ts exercises the rule without a DOM.
 */

export type CrfTheme = "ivory" | "dusk";

export const CREATE_THEME_STORAGE_KEY = "figurints:create-theme:v1";

/** dataset.crfTheme on <html>. Only ever present while /create is mounted. */
export const CREATE_THEME_ATTR = "data-crf-theme";

/** Set for ~300ms across a flip so only that moment gets a color transition. */
export const CREATE_THEMING_ATTR = "data-crf-theming";

export const CREATE_THEME_TRANSITION_MS = 300;

export function isCrfTheme(value: unknown): value is CrfTheme {
  return value === "ivory" || value === "dusk";
}

/**
 * The single resolution rule: an explicit stored choice always wins, otherwise
 * the system decides.
 *
 * `prefers-color-scheme: no-preference` was dropped from every shipped browser,
 * so `matchMedia("(prefers-color-scheme: dark)").matches === false` covers both
 * "system is light" and "system has no preference" — which is exactly the
 * product rule: light is the default when nobody has said otherwise.
 */
export function resolveCreateTheme(stored: string | null | undefined, prefersDark: boolean): CrfTheme {
  if (isCrfTheme(stored)) return stored;
  return prefersDark ? "dusk" : "ivory";
}

/**
 * The boot script, as a compile-time-constant string.
 *
 * It duplicates resolveCreateTheme() because it runs before any module graph
 * exists and so cannot import it — tests/onboarding/create-theme.test.ts pins
 * the two implementations to the same truth table.
 *
 * next/script cannot do this job: `beforeInteractive` must live in the ROOT
 * layout (it would then run on every route, breaking this flow's scoping) and
 * per Next's own docs "does not block page hydration"; every other strategy
 * runs after hydration. A plain non-async inline <script> is emitted in place in
 * the streamed body and is parser-blocking, which is what we need.
 *
 * The catch falls back to ivory (Safari private mode throws on localStorage).
 *
 * CSP note: next.config.ts ships `script-src 'self'` in Content-Security-Policy-
 * REPORT-ONLY, so this logs a report but enforces nothing. Next's own inline
 * `self.__next_f.push(...)` bootstrap already does the same on every App Router
 * page, so that directive is not promotable as written regardless. If it is ever
 * promoted, this body is a constant — a 'sha256-...' allowance covers it.
 */
export const CREATE_THEME_BOOT = `try{var k=${JSON.stringify(CREATE_THEME_STORAGE_KEY)},v=localStorage.getItem(k);if(v!=="ivory"&&v!=="dusk")v=matchMedia("(prefers-color-scheme: dark)").matches?"dusk":"ivory";document.documentElement.dataset.crfTheme=v}catch(e){document.documentElement.dataset.crfTheme="ivory"}`;
