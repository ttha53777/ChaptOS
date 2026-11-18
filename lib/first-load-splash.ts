/**
 * First load splash: what counts as a "hard load".
 *
 * The splash (app/components/first-load-splash/) is server-rendered into every
 * /org/[slug] response but stays display:none until FLS_BOOT stamps
 * html[data-fls]. FLS_BOOT is an inline <script> placed just before that markup,
 * and the browser only executes inline scripts while it parses an HTML document.
 * React never runs a script it inserts during a client navigation (the driver
 * renders it as type="text/plain" on the client, per Next's "preventing flash
 * before hydration" guide). So "hard load" means exactly "this /org/[slug] page
 * came from a fresh HTML document": a typed URL, a bookmark, a reload, a new tab,
 * or a sign-in redirect. A <Link>/router.push never qualifies, and public, auth,
 * /create and /join pages never render the markup at all.
 *
 * Two in-app paths reach /org/[slug] by full document load on purpose: the org
 * switcher and leaving an org (both `location.assign`). Those aren't arrivals,
 * so they call skipNextSplash() first. The flag carries a timestamp and is only
 * honoured for 15s, so a navigation that never happened can't swallow a real
 * splash later.
 *
 * "cached": once this tab has seen the splash finish, later hard loads (a
 * reload, most often) skip the draw and open on the finished ChaptOS mark,
 * waiting only for /api/auth/me. The mock's Cached mode.
 *
 * Pure strings and one tiny storage write: imported by client components, so no
 * server-only imports here (see the lib/ client-bundle boundary).
 */

export const FLS_SKIP_KEY = "chaptos:fls-skip";
export const FLS_SEEN_KEY = "chaptos:fls-seen";

/** Call right before a deliberate full-document hop between orgs. */
export function skipNextSplash(): void {
  try { sessionStorage.setItem(FLS_SKIP_KEY, String(Date.now())); } catch { /* storage blocked: the splash just plays */ }
}

/** Mark the splash as seen in this tab, so a reload takes the cached path. */
export function markSplashSeen(): void {
  try { sessionStorage.setItem(FLS_SEEN_KEY, "1"); } catch { /* ignore */ }
}

/** Runs synchronously during HTML parse, before the splash markup and before
 *  first paint. Stamps html[data-fls] = "on" | "cached", or nothing (skip). */
export const FLS_BOOT = `(function(){var d=document.documentElement;try{var s=sessionStorage,t=+(s.getItem(${JSON.stringify(FLS_SKIP_KEY)})||0);s.removeItem(${JSON.stringify(FLS_SKIP_KEY)});if(t&&Date.now()-t<15e3)return;d.setAttribute("data-fls",s.getItem(${JSON.stringify(FLS_SEEN_KEY)})?"cached":"on")}catch(e){d.setAttribute("data-fls","on")}})()`;
