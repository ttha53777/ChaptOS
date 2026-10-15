/**
 * The signed-in app's aesthetic — "ledger" (the original dusk/ivory look) or
 * "paper" (_design/Dashboard Paper Mock.html: cream paper, brown ink, pastel
 * triplets, Bricolage/Inter/Plex, hard offset shadows).
 *
 * A second axis beside lib/theme.ts, not a third theme: paper has its own day
 * and night, so the Light / Dark / System switch keeps working inside it. The
 * look lives on <html> as data-aesthetic, rendered as a prop by app/layout.tsx,
 * and app/paper-aesthetic.css keys every override off it.
 *
 * Paper is the only aesthetic users can get. Nothing reads the stored choice
 * and nothing can switch it: the settings section is hidden and
 * useAppAesthetic's setter no longer touches the page. The Ledger styles stay
 * in the tree but are unreachable.
 */

export type AppAesthetic = "ledger" | "paper";

export const APP_AESTHETIC_STORAGE_KEY = "chaptos:aesthetic:v1";

export function isAppAesthetic(value: unknown): value is AppAesthetic {
  return value === "ledger" || value === "paper";
}

/** The aesthetic every user gets. */
export const APP_AESTHETIC: AppAesthetic = "paper";

export function resolveAppAesthetic(_stored: string | null | undefined): AppAesthetic {
  return APP_AESTHETIC;
}
