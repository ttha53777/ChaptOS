/**
 * The signed-in app's aesthetic — "ledger" (the original dusk/ivory look) or
 * "paper" (_design/Dashboard Paper Mock.html: cream paper, brown ink, pastel
 * triplets, Bricolage/Inter/Plex, hard offset shadows).
 *
 * A second axis beside lib/theme.ts, not a third theme: paper has its own day
 * and night, so the Light / Dark / System switch keeps working inside it. The
 * choice lives on <html> as data-aesthetic, stamped by APP_AESTHETIC_BOOT
 * before first paint, and app/paper-aesthetic.css keys every override off it.
 *
 * Stored per device (localStorage), like the theme.
 */

export type AppAesthetic = "ledger" | "paper";

export const APP_AESTHETIC_STORAGE_KEY = "chaptos:aesthetic:v1";

export function isAppAesthetic(value: unknown): value is AppAesthetic {
  return value === "ledger" || value === "paper";
}

export function resolveAppAesthetic(stored: string | null | undefined): AppAesthetic {
  return stored === "paper" ? "paper" : "ledger";
}

/** Mirrors resolveAppAesthetic() — it runs before any module graph exists. */
export const APP_AESTHETIC_BOOT = `try{document.documentElement.dataset.aesthetic=localStorage.getItem(${JSON.stringify(APP_AESTHETIC_STORAGE_KEY)})==="paper"?"paper":"ledger"}catch(e){document.documentElement.dataset.aesthetic="ledger"}`;
