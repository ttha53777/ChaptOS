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
 * Ledger is parked: every device resolves to "paper" regardless of what's
 * stored, and the settings switch is hidden. The Ledger code stays so it can
 * come back by restoring the `stored === "ledger"` checks below.
 */

export type AppAesthetic = "ledger" | "paper";

export const APP_AESTHETIC_STORAGE_KEY = "chaptos:aesthetic:v1";

export function isAppAesthetic(value: unknown): value is AppAesthetic {
  return value === "ledger" || value === "paper";
}

export function resolveAppAesthetic(_stored: string | null | undefined): AppAesthetic {
  return "paper";
}

/** Mirrors resolveAppAesthetic() — it runs before any module graph exists. */
export const APP_AESTHETIC_BOOT = `document.documentElement.dataset.aesthetic="paper"`;
