/**
 * Simple fundraisers — the pure half (no DB, safe in the client bundle).
 *
 * The whole model is three numbers per fundraiser:
 *   supplies (what the shopping list cost) · came in (one wrap-up total) · made = came in − supplies
 * Stage is derived, never stored: wrapped (wrappedAt set) / ready (the day has
 * come and nobody has counted yet) / planning.
 *
 * Money is integer cents everywhere on the server; the wire carries dollars
 * (lib/api-types/fundraisers.ts). The DB half is lib/services/fundraiser-service.ts.
 */

import { FundraiserKind } from "@/lib/state/fundraiser-kind";

export interface FundraiserKindInfo {
  label: string;
  /** PaperIcon name. */
  icon: "cake" | "cup" | "drop" | "ticket" | "star";
  /** Paper pastel tone (pp-t-<hue>). */
  hue: "peach" | "lilac" | "sky" | "butter" | "mint";
  /** "Usually on a … list": [supply, typical cost in dollars]. */
  suggestions: readonly (readonly [string, number])[];
}

export const FUNDRAISER_KINDS: Record<FundraiserKind, FundraiserKindInfo> = {
  bake:   { label: "Bake sale",      icon: "cake",   hue: "peach",  suggestions: [["Flour & sugar", 18], ["Butter & eggs", 14], ["Chocolate chips", 9], ["Boxes & napkins", 11], ["Poster board", 6]] },
  drink:  { label: "Drink sale",     icon: "cup",    hue: "lilac",  suggestions: [["Tapioca pearls", 28], ["Tea", 16], ["Milk", 14], ["Cups & straws", 22], ["Ice", 8]] },
  wash:   { label: "Car wash",       icon: "drop",   hue: "sky",    suggestions: [["Car soap", 14], ["Sponges & towels", 12], ["Buckets", 15], ["Poster board", 6]] },
  raffle: { label: "Raffle",         icon: "ticket", hue: "butter", suggestions: [["Prize", 50], ["Ticket roll", 7], ["Cash box", 12]] },
  other:  { label: "Something else", icon: "star",   hue: "mint",   suggestions: [] },
};

/** No picker: the name says what it is, and that's enough to suggest a shopping list. */
export function kindOf(name: string): FundraiserKind {
  const t = name.toLowerCase();
  if (/bake|cookie|brownie|cupcake|pie|donut|muffin/.test(t)) return FundraiserKind.Bake;
  if (/boba|drink|coffee|tea|lemonade|smoothie|cocoa/.test(t)) return FundraiserKind.Drink;
  if (/wash/.test(t)) return FundraiserKind.Wash;
  if (/raffle|50\/50|lottery|drawing/.test(t)) return FundraiserKind.Raffle;
  return FundraiserKind.Other;
}

export type FundraiserStage = "planning" | "ready" | "wrapped";

/** `today` is the viewer's local YYYY-MM-DD; dates are zero-padded so string compare is safe. */
export function stageOf(f: { date: string; wrapped: boolean }, today: string): FundraiserStage {
  if (f.wrapped) return "wrapped";
  return f.date <= today ? "ready" : "planning";
}

export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Whole dollars stay whole; cents only when there are cents. Negative reads "−$12". */
export function formatDollars(dollars: number): string {
  const cents = Math.round(Math.abs(dollars) * 100);
  const body = cents % 100 === 0
    ? (cents / 100).toLocaleString("en-US")
    : (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (dollars < 0 && cents > 0 ? "−$" : "$") + body;
}

/** Local YYYY-MM-DD for "today" (the browser's day, which is the day the sale happens). */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
