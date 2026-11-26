/**
 * Settings → Workflows, as rules both clients run: which pages can be toggled, the
 * Dashboard's widget switches, the Dues switch, the per-group sidebar order, the
 * PATCH body, and every sentence the section says.
 *
 * Pure: no React, no Node, no Prisma (the app compiles it too). The web section
 * (app/org/[slug]/settings/sections/WorkflowsSection.tsx) and the app's
 * mobile/src/settings/Workflows.tsx render from this.
 *
 * Both kinds of toggle are visibility only. A page rewrites enabledWorkflows; a
 * section rewrites disabledFeatures (opt-out: only the ids turned OFF are stored).
 * Nothing is deleted.
 */
import { ALWAYS_ON_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { NAV_GROUPS, NAV_LABELS, NAV_WORKFLOW_MAP, applyNavOrder, isNavVisible } from "@/lib/nav-order";
import { WORKFLOW_FEATURES, type DisabledFeatures, type WorkflowFeature } from "@/lib/workflow-features";
import { BUILTIN_METRIC_KPI } from "@/lib/tracked-metrics";

// Fixed display names for nav keys whose stored label is out of date. The key
// stays the routing/persistence id (navOrder rows store it); only the text changes.
export const NAV_DISPLAY_NAMES: Record<string, string> = {
  Instagram: "Media",
};
export const navDisplayName = (label: string) => NAV_DISPLAY_NAMES[label] ?? label;

// One-line description of each hideable surface, keyed by nav label. Shown next
// to the toggle in both the post-creation page picker (/[slug]/onboarding) and
// the Workflows settings section, so the two surfaces describe a page the same
// way. Only labels whose workflow is non-null in NAV_WORKFLOW_MAP need an entry;
// the always-on surfaces (Dashboard/Timeline) are never toggled.
export const NAV_DESCRIPTIONS: Record<string, string> = {
  Chapter:     "Meeting minutes, agenda, and chapter-wide records.",
  Tasks:       "Hand out tasks and deadlines to members or roles, and track what's done.",
  Brotherhood: "Member roster, profiles, attendance, and dues.",
  Treasury:    "Budget, transactions, and the running balance.",
  Parties:     "Social events with door revenue and wrap-up tracking.",
  Service:     "Service events and per-member service-hour totals.",
  Programming: "Plan programs, socials, fundraisers, and community service.",
  Instagram:   "Plan and track social posts and announcements.",
  Docs:        "Pinned links and shared documents.",
  Fundraisers: "Bake sales and car washes: a shopping list, one wrap-up total, and what each one made.",
};

export interface PickerItem {
  label: string;
  workflow: WorkflowId;
  description: string;
}

/** One toggle per hideable nav surface: every nav label whose workflow is non-null. */
export const PICKER_ITEMS: PickerItem[] = NAV_LABELS.flatMap((label) => {
  const workflow = NAV_WORKFLOW_MAP[label];
  if (workflow == null) return []; // always-on surface — not a toggle
  return [{ label, workflow, description: NAV_DESCRIPTIONS[label] ?? "" }];
});

/** The workflows this section owns. Anything else enabled ("attendance", "events"
 *  without a nav row) is carried through a save verbatim. */
export const TOGGLEABLE_WORKFLOWS: ReadonlySet<WorkflowId> = new Set<WorkflowId>(PICKER_ITEMS.map((i) => i.workflow));

/** Always-on surfaces (Dashboard, Timeline), shown as locked rows. */
export const ALWAYS_ON_LABELS: string[] = NAV_LABELS.filter((label) => NAV_WORKFLOW_MAP[label] == null);

/** Tracking dues is the operations/kpi-dues opt-out, but it reaches past the
 *  dashboard (Treasury's Dues tab, the roster, standing), so it has its own switch. */
export const DUES_FEATURE = BUILTIN_METRIC_KPI.duesOwed;

/** A workflow's section switches. The Dashboard's leave out Dues (it has its own switch). */
export function featuresOf(workflow: WorkflowId): readonly WorkflowFeature[] {
  return WORKFLOW_FEATURES[workflow].filter(f => workflow !== "operations" || f.id !== DUES_FEATURE);
}

/** Dashboard widgets: the always-on "operations" workflow's features. */
export const DASHBOARD_FEATURES = WORKFLOW_FEATURES.operations;

export const hasFeatures = (workflow: WorkflowId) => WORKFLOW_FEATURES[workflow].length > 0;

/* ── disabled features (opt-out) ────────────────────────────────────────────── */

export type DisabledMap = Map<WorkflowId, Set<string>>;

/** A stable, order-independent content key for a disabled-features map. */
export function disabledKey(map: DisabledFeatures): string {
  return Object.keys(map)
    .sort()
    .map((w) => `${w}:${[...(map[w as WorkflowId] ?? [])].sort().join("|")}`)
    .join(",");
}

export function disabledMapOf(raw: DisabledFeatures | Record<string, string[]> | null | undefined): DisabledMap {
  const map: DisabledMap = new Map();
  for (const [w, ids] of Object.entries(raw ?? {})) {
    if (ids && ids.length) map.set(w as WorkflowId, new Set(ids));
  }
  return map;
}

export const cloneDisabled = (m: DisabledMap): DisabledMap => new Map([...m].map(([w, s]) => [w, new Set(s)]));

/** The stored shape: only non-empty sets. */
export function disabledFeaturesOf(m: DisabledMap): DisabledFeatures {
  const out: DisabledFeatures = {};
  for (const [w, s] of m) {
    if (s.size) out[w] = [...s];
  }
  return out;
}

export const disabledMapKey = (m: DisabledMap) => disabledKey(disabledFeaturesOf(m));

/** A feature is ON when it isn't in its workflow's disabled set. */
export const featureOn = (m: DisabledMap, workflow: WorkflowId, id: string) => !m.get(workflow)?.has(id);

export function toggleFeature(prev: DisabledMap, workflow: WorkflowId, id: string): DisabledMap {
  const next = cloneDisabled(prev);
  const set = next.get(workflow) ?? new Set<string>();
  if (set.has(id)) set.delete(id);
  else set.add(id);
  if (set.size) next.set(workflow, set);
  else next.delete(workflow);
  return next;
}

export function toggleWorkflow(prev: ReadonlySet<WorkflowId>, workflow: WorkflowId): Set<WorkflowId> {
  const next = new Set(prev);
  if (next.has(workflow)) next.delete(workflow);
  else next.add(workflow);
  return next;
}

/* ── sidebar order ──────────────────────────────────────────────────────────── */

export type NavOrderMap = Map<string, string[]>;

/** The sparse stored order, materialized per group for the editor. */
export const seedOrder = (navOrder: readonly string[]): NavOrderMap =>
  new Map(NAV_GROUPS.map((g) => [g.label, applyNavOrder(g.items, navOrder)]));

export const flatOrder = (order: NavOrderMap): string[] => NAV_GROUPS.flatMap((g) => order.get(g.label) ?? [...g.items]);

/** Dirty when the order on screen differs from the stored one, through the same
 *  applyNavOrder lens (a sparse stored list and an explicit equal one are the same). */
export function navDirty(order: NavOrderMap, persisted: readonly string[]): boolean {
  const persistedFlat = NAV_GROUPS.flatMap((g) => applyNavOrder(g.items, persisted));
  return persistedFlat.join("|") !== flatOrder(order).join("|");
}

/** Move a label up/down within its group (never across the group headings). */
export function moveItem(prev: NavOrderMap, groupLabel: string, index: number, dir: -1 | 1): NavOrderMap {
  const items = [...(prev.get(groupLabel) ?? [])];
  const target = index + dir;
  if (target < 0 || target >= items.length) return prev;
  const a = items[index];
  const b = items[target];
  if (a === undefined || b === undefined) return prev;
  items[index] = b;
  items[target] = a;
  const next = new Map(prev);
  next.set(groupLabel, items);
  return next;
}

/** Labels visible with the org's STORED workflows: hidden pages stay in the reorder
 *  list, dimmed, so their slot is kept. */
export const enabledLabels = (persisted: Iterable<string>): Set<string> => {
  const list = [...persisted];
  return new Set(NAV_LABELS.filter((label) => isNavVisible(label, list)));
};

/* ── dirty + save ───────────────────────────────────────────────────────────── */

export function workflowsDirty(p: {
  selected: ReadonlySet<WorkflowId>; persisted: ReadonlySet<WorkflowId>;
  disabled: DisabledMap; persistedDisabledKey: string; navDirty: boolean;
}): boolean {
  for (const { workflow } of PICKER_ITEMS) {
    if (p.selected.has(workflow) !== p.persisted.has(workflow)) return true;
  }
  if (disabledMapKey(p.disabled) !== p.persistedDisabledKey) return true;
  return p.navDirty;
}

/** PATCH /api/orgs/config, all in one body. enabledWorkflows is a full replace, so it
 *  carries every enabled workflow this section doesn't own, plus the always-on ids.
 *  navOrder only when it changed, so a pages-only edit never rewrites the column. */
export function workflowsPatch(p: {
  persisted: ReadonlySet<WorkflowId>; selected: ReadonlySet<WorkflowId>; disabled: DisabledMap; order: NavOrderMap; navDirty: boolean;
}): { enabledWorkflows: WorkflowId[]; disabledFeatures: DisabledFeatures; navOrder?: string[] } {
  const chosen = new Set<WorkflowId>([
    ...[...p.persisted].filter((w) => !TOGGLEABLE_WORKFLOWS.has(w)),
    ...PICKER_ITEMS.filter((i) => p.selected.has(i.workflow)).map((i) => i.workflow),
    ...ALWAYS_ON_WORKFLOWS,
  ]);
  return {
    enabledWorkflows: [...chosen],
    disabledFeatures: disabledFeaturesOf(p.disabled),
    ...(p.navDirty ? { navOrder: flatOrder(p.order) } : {}),
  };
}

/* ── words ──────────────────────────────────────────────────────────────────── */

export const WORKFLOWS_COPY = {
  lede: "Choose which pages this organization shows in the sidebar, and which sections appear within a page. Turning a page or section off just hides it — your data is kept and comes back exactly as it was when you turn it on again.",
  alwaysIncluded: "Always included",
  alwaysNote: "Every organization gets these.",
  locked: "Locked",
  dashboardWidgets: "Dashboard widgets",
  dashboardNote: "Unselected widgets are hidden from the dashboard.",
  optionalPages: "Optional pages",
  optionalNote: "Unselected pages are hidden from the sidebar.",
  sidebarOrder: "Sidebar order",
  orderNote: "Arrange pages within each section. This is the order everyone in the organization sees in the sidebar.",
  hidden: "Hidden",
  save: "Save changes",
  saving: "Saving…",
  reset: "Reset",
  unsaved: "Unsaved",
  saved: "Pages updated.",
  forbidden: "You need the Org settings permission to change which pages are enabled.",
  failed: "Couldn't save your changes. Try again.",
  /** "Track " + dues word: two text runs, as the web's JSX splits them. */
  duesTitle: (dues: string): [string, string] => ["Track ", dues.toLowerCase()],
  duesLabel: (dues: string) => `Track ${dues.toLowerCase()}`,
  duesSub: (on: boolean, w: { dues: string; members: string; treasury: string }) => on
    ? `Charge ${w.members.toLowerCase()}, record payments and see who still owes, on the ${w.treasury} page, the roster and the dashboard.`
    : `Off. The ${w.dues} tab, card and balances are hidden everywhere. Anything already recorded is kept for when you turn it back on.`,
  moveUp: (label: string) => `Move ${navDisplayName(label)} up`,
  moveDown: (label: string) => `Move ${navDisplayName(label)} down`,
};

/** A save error as the section says it: 403/forbidden is the permission line. */
export const saveErrorOf = (message: string, forbidden: string) =>
  message.includes("403") || /forbidden/i.test(message) ? forbidden : WORKFLOWS_COPY.failed;
