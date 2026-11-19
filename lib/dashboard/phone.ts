/**
 * The dashboard on a phone (DashGrid + phone-dash.css): the org's two columns
 * interleave into one stack, what's happening now leads, and the cards that fold to a
 * glance close the page as half-width tiles. Pure; the web's DashGrid and the native
 * app both order the page with it.
 */
import type { DashCardId, DashboardLayout } from "@/lib/dashboard-layout";

/** What leads on a phone, whatever column the org put it in. */
export const PHONE_LEAD: DashCardId[] = ["announcement", "next", "needs", "week"];

/** Cards that fold to a half-width glance tile on a phone (a tap opens the card). */
export const GLANCE_CARDS: ReadonlySet<DashCardId> = new Set<DashCardId>(["members", "treasury", "activity", "docs"]);

export interface PhoneDash {
  /** Full-width under the briefing, before the numbers (the pinned note's top spot). */
  top: DashCardId[];
  /** Whole cards, in phone order. */
  cards: DashCardId[];
  /** Folded cards, two to a row, in phone order. */
  tiles: DashCardId[];
  /** An odd tile out takes the whole last row. */
  loneTile: DashCardId | null;
}

/**
 * `available` = cards this viewer's org can show at all (workflows, features,
 * permissions, tracked metrics); the layout then orders and hides among them.
 * `glance` = which of them fold (defaults to GLANCE_CARDS).
 */
export function phoneDash(layout: DashboardLayout, available: ReadonlySet<DashCardId>, glance: ReadonlySet<DashCardId> = GLANCE_CARDS): PhoneDash {
  const hidden = new Set<string>(layout.hidden);
  const shown = (ids: DashCardId[]) => ids.filter(k => available.has(k) && !hidden.has(k));
  const top = shown(layout.top);
  const main = shown(layout.main);
  const rail = shown(layout.rail);
  const order: DashCardId[] = [];
  for (let i = 0; i < Math.max(main.length, rail.length); i++) {
    if (main[i]) order.push(main[i]!);
    if (rail[i]) order.push(rail[i]!);
  }
  const rank = (k: DashCardId) => {
    const lead = PHONE_LEAD.indexOf(k);
    return lead > -1 ? lead : (glance.has(k) ? 200 : 100) + order.indexOf(k);
  };
  const sorted = [...order].sort((a, z) => rank(a) - rank(z));
  const tiles = sorted.filter(k => glance.has(k));
  return {
    top,
    cards: sorted.filter(k => !glance.has(k)),
    tiles,
    loneTile: tiles.length % 2 === 1 ? tiles[tiles.length - 1]! : null,
  };
}
