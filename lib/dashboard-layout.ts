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
export const DASH_CARDS = ["needs", "members", "ballot", "week", "treasury", "activity"] as const;
export type DashCardId = (typeof DASH_CARDS)[number];

/** Full-width bands with a fixed place on the page: hideable, not movable. */
export const DASH_BANDS = ["health", "announcement", "numbers"] as const;
export type DashBandId = (typeof DASH_BANDS)[number];

export type DashWidgetId = DashCardId | DashBandId;

/** The built-in headline numbers. Custom metrics join as `metric:<definitionId>`. */
export const DASH_STATS = ["attendance", "dues", "gpa", "service", "members", "week", "tasks", "requests", "balance"] as const;
export type DashStatId = (typeof DASH_STATS)[number] | `metric:${number}`;

export const MAX_DASH_NUMBERS = 6;

/** The wire shape (lib/api-types/me.ts), narrowed to the ids this module knows. */
export interface DashboardLayout extends DashboardLayoutWire {
  main: DashCardId[];
  rail: DashCardId[];
  hidden: DashWidgetId[];
  numbers: DashStatId[] | null;
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  main: ["needs", "week", "members"],
  rail: ["ballot", "treasury", "activity"],
  hidden: [],
  numbers: null,
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
 */
export function normalizeDashboardLayout(raw: unknown): DashboardLayout | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const col = (v: unknown) => strings(v).filter(k => CARD_SET.has(k) && !seen.has(k) && (seen.add(k), true)) as DashCardId[];
  const main = col(r.main);
  const rail = col(r.rail);
  for (const k of DEFAULT_DASHBOARD_LAYOUT.main) if (!seen.has(k)) main.push(k);
  for (const k of DEFAULT_DASHBOARD_LAYOUT.rail) if (!seen.has(k)) rail.push(k);

  const hidden = [...new Set(strings(r.hidden).filter(k => WIDGET_SET.has(k)))] as DashWidgetId[];
  const numbers = r.numbers === null || r.numbers === undefined
    ? null
    : [...new Set(strings(r.numbers).filter(isDashStat))].slice(0, MAX_DASH_NUMBERS) as DashStatId[];

  return { main, rail, hidden, numbers };
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

const colOf = (l: DashboardLayout, w: DashCardId): "main" | "rail" => (l.main.includes(w) ? "main" : "rail");

/**
 * Nudge a card one visible step up/down its column, or across to the other one.
 * Up/down hops over cards that are hidden or not available to this org, so every
 * press visibly moves the card.
 */
export function nudgeCard(l: DashboardLayout, w: DashCardId, dir: "up" | "down" | "swap", visible: (k: DashCardId) => boolean): DashboardLayout {
  const c = colOf(l, w);
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
  if (j < 0 || j >= a.length) return l;
  a.splice(i, 1);
  a.splice(j, 0, w);
  return { ...l, [c]: a };
}

/** Drop a dragged card before/after another card, or at the end of a column. */
export function dropCard(l: DashboardLayout, w: DashCardId, target: { card: DashCardId; after: boolean } | { column: "main" | "rail" }): DashboardLayout {
  const main = l.main.filter(x => x !== w);
  const rail = l.rail.filter(x => x !== w);
  const next = { ...l, main, rail };
  if ("column" in target) {
    next[target.column] = [...next[target.column], w];
    return next;
  }
  if (target.card === w) return l;
  const c = main.includes(target.card) ? "main" : "rail";
  const a = [...next[c]];
  a.splice(a.indexOf(target.card) + (target.after ? 1 : 0), 0, w);
  next[c] = a;
  return next;
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

// ── Presets ────────────────────────────────────────────────────────────────

export interface DashPreset {
  id: string;
  name: string;
  blurb: string;
  /** Applied over DEFAULT_DASHBOARD_LAYOUT; ids the org lacks are skipped at render. */
  layout: Partial<DashboardLayout>;
  /** Only offered when this stat is available to the org. */
  needs?: DashStatId;
}

export const DASH_PRESETS: DashPreset[] = [
  { id: "standard", name: "Standard", blurb: "The layout every org starts with.", layout: {} },
  {
    id: "basics", name: "Just the basics", blurb: "This week, people, what needs doing.",
    layout: { hidden: ["activity", "health"], numbers: ["members", "week", "tasks"] },
  },
  {
    id: "events", name: "Events first", blurb: "The week leads the page.",
    layout: { main: ["week", "needs", "activity"], rail: ["ballot", "members", "treasury"], numbers: ["week", "members", "attendance"] },
  },
  {
    id: "people", name: "People first", blurb: "Who's here, who's drifting, who's asking in.",
    layout: { main: ["members", "needs"], rail: ["ballot", "week", "activity", "treasury"], numbers: ["members", "requests", "attendance"] },
  },
  {
    id: "money", name: "Money-minded", blurb: "The account and what's owed, up top.", needs: "balance",
    layout: { main: ["needs", "members"], rail: ["treasury", "ballot", "week", "activity"], numbers: ["balance", "dues", "members"] },
  },
  {
    id: "greek", name: "Greek chapter", blurb: "Attendance, dues, grades and service.", needs: "gpa",
    layout: { numbers: ["attendance", "dues", "gpa", "service"] },
  },
];

export function presetLayout(p: DashPreset): DashboardLayout {
  return resolveDashboardLayout({ ...DEFAULT_DASHBOARD_LAYOUT, ...p.layout });
}
