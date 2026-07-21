/**
 * The /create flow's Timeline step, as pure functions.
 *
 * The step edits the categories a new org's timeline will use. Its draft state
 * is deliberately SPARSE (the same posture as `Draft.vocab`): built-ins carry
 * only the founder's label/color overrides, and `customs` is null until they
 * touch it — null meaning "whatever the org type seeds", so a founder who skips
 * the step gets exactly today's provisioning.
 *
 * `resolveEventTypeRows` turns that sparse state into the full ordered list of
 * rows the org will actually be created with. It is the ONE resolver: the step's
 * editor, its live preview, the Blueprint step's chips, and the payload mapper
 * in ./draft all read it, so what the founder sees and what
 * `provisionOrg` writes can't drift.
 *
 * Mirrors the server's `resolveEventTypes` in lib/services/org-service.ts —
 * tests/onboarding assert the two agree.
 */

import { BUILTIN_EVENT_TYPES, nextPaletteColor } from "@/lib/event-types";
import { DEFAULT_EVENT_TYPE_SEEDS, getOrgType } from "@/lib/org-types";
import { KIND_TO_TYPE, type KindId } from "./kinds";

/** Cap on founder-authored + starter types in one draft. Well under the
    service's MAX_EVENT_TYPES_PER_ORG (40), leaving room to add more later. */
export const MAX_DRAFT_EVENT_TYPES = 20;

/**
 * A non-built-in type in the draft. `workflowId` distinguishes the two kinds:
 *   - "events" — a starter seeded from the org type; follows the Events page,
 *     exactly as provisionOrg has always seeded it.
 *   - null — a type the founder typed by hand. Ungated, because a category
 *     someone deliberately named should not silently vanish with a page toggle.
 */
export interface DraftCustomEventType {
  slug: string;
  label: string;
  color: string;
  colorDark: string;
  workflowId: "events" | null;
}

/** Sparse label/color overrides for the built-ins, keyed by slug. */
export type DraftBuiltinOverrides = Record<
  string,
  { label?: string; color?: string; colorDark?: string }
>;

/** One resolved row — what the step renders and what will be created. */
export interface DraftEventTypeRow {
  slug: string;
  label: string;
  color: string;
  colorDark: string;
  builtin: boolean;
  /** Gating workflow; null = always on the timeline. */
  workflowId: string | null;
  /** False when the gating workflow is off — rendered as a ghost row. */
  active: boolean;
}

/**
 * The starter categories an org type seeds, in draft shape. The client-side
 * mirror of provisionOrg's `template.eventTypeSeeds ?? DEFAULT_EVENT_TYPE_SEEDS`
 * fallback, so the step can show them before the org exists.
 */
export function starterEventTypes(kind: KindId | null): DraftCustomEventType[] {
  const template = kind ? getOrgType(KIND_TO_TYPE[kind]) : null;
  const seeds = template?.eventTypeSeeds ?? DEFAULT_EVENT_TYPE_SEEDS;
  return seeds.map(s => ({
    slug:       s.slug,
    label:      s.label,
    color:      s.color,
    colorDark:  s.colorDark,
    workflowId: "events" as const,
  }));
}

/**
 * Resolve the sparse draft state into the full row list, in creation order:
 * the built-ins (registry order) then the customs (list order).
 *
 * `meetingsLabel` is the org's word for meetings — the `chapter` built-in
 * defaults to it, so a club that calls them "General Body" doesn't get a
 * timeline type labeled "Chapter". An explicit rename in the step wins and pins
 * the label, which is why the override is stored separately rather than being
 * seeded into it.
 *
 * Rows are returned INCLUDING inactive ones: a type whose workflow is off is
 * still created (its row is what lets existing events resolve a color later) —
 * `active` only decides whether the step ghosts it and the picker offers it.
 */
export function resolveEventTypeRows(args: {
  builtins: DraftBuiltinOverrides;
  customs: DraftCustomEventType[] | null;
  kind: KindId | null;
  meetingsLabel: string;
  enabledWorkflows: readonly string[];
}): DraftEventTypeRow[] {
  const enabled = new Set(args.enabledWorkflows);
  const isActive = (workflowId: string | null) => workflowId == null || enabled.has(workflowId);

  const builtins: DraftEventTypeRow[] = BUILTIN_EVENT_TYPES.map(t => {
    const over = args.builtins[t.slug] ?? {};
    return {
      slug:       t.slug,
      label:      over.label ?? (t.slug === "chapter" ? args.meetingsLabel : t.label),
      color:      over.color ?? t.color,
      colorDark:  over.colorDark ?? t.colorDark,
      builtin:    true,
      workflowId: t.workflowId,
      active:     isActive(t.workflowId),
    };
  });

  const customs = (args.customs ?? starterEventTypes(args.kind)).map(c => ({
    slug:       c.slug,
    label:      c.label,
    color:      c.color,
    colorDark:  c.colorDark,
    builtin:    false,
    workflowId: c.workflowId,
    active:     isActive(c.workflowId),
  }));

  return [...builtins, ...customs];
}

/**
 * Extra categories worth suggesting per kind, BEYOND the starters already
 * loaded. Pure prompts for the adder — nothing is seeded from this list, and a
 * suggestion already present in the draft is filtered out by the caller.
 */
export const EVENT_TYPE_SUGGESTIONS: Record<KindId, readonly string[]> = {
  fraternity: ["Rush", "Formal", "Brotherhood", "Philanthropy", "Alumni"],
  sorority:   ["Recruitment", "Formal", "Sisterhood", "Philanthropy", "Alumni"],
  club:       ["Workshop", "Guest speaker", "Social", "Info session"],
  team:       ["Scrimmage", "Team dinner", "Film session", "Tryouts"],
  service:    ["Volunteer day", "Drive", "Training", "Partner visit"],
  honor:      ["Induction", "Study session", "Guest speaker", "Banquet"],
  arts:       ["Rehearsal", "Performance", "Auditions", "Tech week"],
  other:      ["Social", "Workshop", "Fundraiser", "Guest speaker"],
};

/** Kebab-case a label into a slug the event-type schema accepts. */
function slugifyType(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 46)
    .replace(/-+$/, "");
}

/**
 * A slug for a newly added type, de-duped against `taken` (which must include
 * the built-in slugs — a custom may never shadow one). Same suffix scheme as
 * metricSlug in org-service.
 */
export function nextCustomTypeSlug(label: string, taken: readonly string[]): string {
  const base = slugifyType(label) || "type";
  const used = new Set(taken);
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/**
 * The color a newly added type pre-selects: the first palette entry no existing
 * row is using, so two adds in a row never land the same dot.
 */
export function nextEventTypeColor(rows: readonly { color: string }[]) {
  return nextPaletteColor(rows.map(r => r.color));
}
