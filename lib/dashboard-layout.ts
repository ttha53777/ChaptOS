/**
 * The org's dashboard arrangement — one per org, arranged by an org admin and
 * shared by every member (there is deliberately no per-person layout).
 *
 * Pure and client-safe: the dashboard page reads it to render, the Customize
 * mode edits it, and org-config-service normalizes it before it is stored on
 * OrganizationConfig.dashboardLayout. Null in the column means "never
 * customized", which renders DEFAULT_DASHBOARD_LAYOUT.
 *
 * What it does NOT decide is whether a widget exists at all. That stays with the
 * org's workflows (no Treasury page → no treasury card) and its Settings feature
 * switches (disabledFeatures.operations). The layout only orders and hides what
 * those leave available, so turning a workflow back on lands its card where the
 * admin last put it.
 */
import type { DashboardLayout as DashboardLayoutWire } from "@/lib/api-types/me";

/** Cards in the two-column grid. Order and column are the admin's to change. */
export const DASH_CARDS = ["needs", "members", "ballot", "week", "treasury", "activity", "announcement", "next", "docs"] as const;
export type DashCardId = (typeof DASH_CARDS)[number];

/**
 * Cards that may also sit in the full-width spot at the top of the page, under
 * the health dial. Only the pinned note: it is a message for everyone, and that
 * spot is where it always lived before it could move.
 */
export const TOP_CARDS: readonly DashCardId[] = ["announcement"];
export const canSitOnTop = (k: DashCardId) => TOP_CARDS.includes(k);

/** Where a card can be: the top spot or one of the two columns. */
export type DashZone = "top" | "main" | "rail";

/**
 * Widgets with a fixed place on the page. They can be put away and brought
 * back, but not moved. (The headline numbers and the pinned note used to be
 * bands too: an empty number row now simply isn't drawn, and the pinned note is
 * a card that may also sit in the top spot.)
 */
export const DASH_BANDS = ["health"] as const;
export type DashBandId = (typeof DASH_BANDS)[number];

export type DashWidgetId = DashCardId | DashBandId;

/** The built-in headline numbers. Custom metrics join as `metric:<definitionId>`. */
export const DASH_STATS = ["attendance", "dues", "gpa", "service", "members", "week", "tasks", "requests", "balance"] as const;
export type DashStatId = (typeof DASH_STATS)[number] | `metric:${number}`;

export const MAX_DASH_NUMBERS = 3;

/** What a never-customized org shows up top: true for every kind of org. */
export const DEFAULT_DASH_NUMBERS: DashStatId[] = ["members", "week", "tasks"];

/** The wire shape (lib/api-types/me.ts), narrowed to the ids this module knows. */
export interface DashboardLayout extends DashboardLayoutWire {
  top: DashCardId[];
  main: DashCardId[];
  rail: DashCardId[];
  hidden: DashWidgetId[];
  numbers: DashStatId[];
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  top: ["announcement"],
  main: ["needs", "week", "members"],
  rail: ["next", "ballot", "treasury", "activity", "docs"],
  hidden: [],
  numbers: DEFAULT_DASH_NUMBERS,
};

const CARD_SET = new Set<string>(DASH_CARDS);
const WIDGET_SET = new Set<string>([...DASH_CARDS, ...DASH_BANDS]);

export function isDashStat(k: string): k is DashStatId {
  return (DASH_STATS as readonly string[]).includes(k) || /^metric:[1-9]\d{0,9}$/.test(k);
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Coerce anything (a stored JSON blob, a client payload) into a valid layout, or
 * null when there's nothing layout-shaped to work with.
 *
 * Unknown ids are dropped, duplicates keep their first position, and any card
 * the stored layout doesn't mention is appended to its default column. That last
 * rule is what lets a card added to the product later show up for orgs that
 * customized before it existed, instead of vanishing.
 *
 * Numbers: null/absent (the old "whatever the org tracks") becomes the default
 * three; a stored layout that hid the old "numbers" band keeps an empty row.
 */
export function normalizeDashboardLayout(raw: unknown): DashboardLayout | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const col = (v: unknown) => strings(v).filter(k => CARD_SET.has(k) && !seen.has(k) && (seen.add(k), true)) as DashCardId[];
  const top = col(strings(r.top).filter(k => canSitOnTop(k as DashCardId)));
  const main = col(r.main);
  const rail = col(r.rail);
  // Stored before the pinned note was a card: it was a band, so it goes back
  // to the top spot (keeping a "hidden" if it had one).
  for (const k of DEFAULT_DASHBOARD_LAYOUT.top) if (!seen.has(k)) { top.push(k); seen.add(k); }
  for (const k of DEFAULT_DASHBOARD_LAYOUT.main) if (!seen.has(k)) main.push(k);
  for (const k of DEFAULT_DASHBOARD_LAYOUT.rail) if (!seen.has(k)) rail.push(k);

  const rawHidden = strings(r.hidden);
  const hidden = [...new Set(rawHidden.filter(k => WIDGET_SET.has(k)))] as DashWidgetId[];
  const numbers = rawHidden.includes("numbers")
    ? []
    : r.numbers === null || r.numbers === undefined
      ? [...DEFAULT_DASH_NUMBERS]
      : [...new Set(strings(r.numbers).filter(isDashStat))].slice(0, MAX_DASH_NUMBERS) as DashStatId[];

  return { top, main, rail, hidden, numbers };
}

/** The layout an org renders: its stored one, else the default. */
export function resolveDashboardLayout(raw: unknown): DashboardLayout {
  return normalizeDashboardLayout(raw) ?? DEFAULT_DASHBOARD_LAYOUT;
}

export function sameDashboardLayout(a: DashboardLayout, b: DashboardLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Moves ──────────────────────────────────────────────────────────────────
// Each returns a new layout (never mutates) or the same object when the move is
// a no-op, so callers can skip a re-render by identity.

export const zoneOf = (l: DashboardLayout, w: DashCardId): DashZone => (l.top.includes(w) ? "top" : l.main.includes(w) ? "main" : "rail");

/**
 * Nudge a card one visible step up/down its column, or across to the other one.
 * Up/down hops over cards that are hidden or not available to this org, so every
 * press visibly moves the card.
 */
export function nudgeCard(l: DashboardLayout, w: DashCardId, dir: "up" | "down" | "swap", visible: (k: DashCardId) => boolean): DashboardLayout {
  const z = zoneOf(l, w);
  if (z === "top") return dir === "down" ? placeCard(l, w, "main", 0, visible) : l;
  const c = z;
  const a = [...l[c]];
  const i = a.indexOf(w);
  if (dir === "swap") {
    const o = c === "main" ? "rail" : "main";
    const b = [...l[o]];
    a.splice(i, 1);
    // Land beside the card at the same visual height, counting only visible ones.
    const vIdx = l[c].slice(0, i).filter(visible).length;
    let at = b.length;
    for (let j = 0, n = 0; j < b.length; j++) if (visible(b[j]) && n++ === vIdx) { at = j; break; }
    b.splice(at, 0, w);
    return { ...l, [c]: a, [o]: b };
  }
  let j = i;
  do { j += dir === "up" ? -1 : 1; } while (j >= 0 && j < a.length && !visible(a[j]));
  // Up past the first card of a column: back to the top spot, if it may go there.
  if (j < 0 && dir === "up" && canSitOnTop(w)) return placeCard(l, w, "top", 0, visible);
  if (j < 0 || j >= a.length) return l;
  a.splice(i, 1);
  a.splice(j, 0, w);
  return { ...l, [c]: a };
}

/**
 * Put a card at a spot the viewer can see: the `at`-th visible slot of a column
 * (past the last visible card = the end). Unhides it too, so the same call
 * both moves a card and brings one back from the tray. Hidden and unavailable
 * cards keep their place in the arrays; only visible ones count as slots.
 */
export function placeCard(l: DashboardLayout, w: DashCardId, column: DashZone, at: number, visible: (k: DashCardId) => boolean): DashboardLayout {
  if (column === "top" && !canSitOnTop(w)) return l;
  const top = l.top.filter(x => x !== w);
  const main = l.main.filter(x => x !== w);
  const rail = l.rail.filter(x => x !== w);
  const next = { ...l, top, main, rail, hidden: l.hidden.filter(x => x !== w) };
  const a = [...next[column]];
  const before = a.filter(k => k !== w && visible(k))[at];
  a.splice(before === undefined ? a.length : a.indexOf(before), 0, w);
  next[column] = a;
  return sameDashboardLayout(next, l) ? l : next;
}

export function setWidgetHidden(l: DashboardLayout, w: DashWidgetId, hidden: boolean): DashboardLayout {
  const has = l.hidden.includes(w);
  if (has === hidden) return l;
  return { ...l, hidden: hidden ? [...l.hidden, w] : l.hidden.filter(x => x !== w) };
}

/**
 * Put `stat` in slot `i` of the headline numbers (append when i === length). If
 * it's already shown in another slot the two trade places, so a number never
 * appears twice.
 */
export function setNumberSlot(numbers: DashStatId[], i: number, stat: DashStatId): DashStatId[] {
  const next = [...numbers];
  const j = next.indexOf(stat);
  if (i >= next.length) {
    if (j > -1 || next.length >= MAX_DASH_NUMBERS) return next;
    return [...next, stat];
  }
  if (j > -1) next[j] = next[i];
  next[i] = stat;
  return next;
}
