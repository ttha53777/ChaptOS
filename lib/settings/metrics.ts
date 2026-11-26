/**
 * Settings → Custom metrics, as rules both clients run: the headline choices, the slug
 * a name suggests, the edit/new forms, the request bodies with their checks, and every
 * sentence. Pure; the web's CustomMetricsSection and the app's settings/Metrics.tsx
 * render from it.
 *
 *   GET    /api/metrics/definitions        every live definition
 *   POST   /api/metrics/definitions        (201; MANAGE_SETTINGS; max 20 per org)
 *   PATCH  /api/metrics/definitions/[id]   (the slug never changes)
 *   DELETE /api/metrics/definitions/[id]   (soft: recorded values are kept)
 */

export type Aggregation = "avg" | "sum" | "count_on_track";

export interface MetricDefLike {
  id: number;
  name: string;
  unit: string | null;
  goal: number;
  atRiskBelow: number;
  watchBelow: number | null;
  aggregation: Aggregation;
}

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  avg:            "Average per member",
  sum:            "Chapter total",
  count_on_track: "# members on track",
};

export const AGGREGATIONS = Object.keys(AGGREGATION_LABELS) as Aggregation[];

export const MAX_METRICS = 20;
export const NAME_MAX = 40;
export const SLUG_MAX = 50;
export const UNIT_MAX = 10;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
}

export interface EditState {
  name:        string;
  unit:        string;
  goal:        string;
  atRiskBelow: string;
  watchBelow:  string;
  aggregation: Aggregation;
}

export function toEditState(def: MetricDefLike): EditState {
  return {
    name:        def.name,
    unit:        def.unit ?? "",
    goal:        String(def.goal),
    atRiskBelow: String(def.atRiskBelow),
    watchBelow:  def.watchBelow != null ? String(def.watchBelow) : "",
    aggregation: def.aggregation,
  };
}

export interface NewMetricForm extends EditState {
  slug:        string;
  slugTouched: boolean;
}

export const EMPTY_FORM: NewMetricForm = {
  name:        "",
  slug:        "",
  unit:        "",
  goal:        "",
  atRiskBelow: "",
  watchBelow:  "",
  aggregation: "avg",
  slugTouched: false,
};

/** Typing a name suggests the slug until the slug is edited by hand. */
export function withField(prev: NewMetricForm, k: keyof EditState, v: string): NewMetricForm {
  const next = { ...prev, [k]: v } as NewMetricForm;
  if (k === "name" && !prev.slugTouched) next.slug = slugify(v);
  return next;
}

export const NUMBERS_INVALID = "Goal and At-Risk threshold must be valid numbers";
export const REQUIRED = "Name, slug, goal, and at-risk threshold are required";

/** PATCH body for an edit; watchBelow cleared is null. */
export function editBody(form: EditState): { body: Record<string, unknown> } | { error: string } {
  const body: Record<string, unknown> = {
    name:        form.name.trim(),
    unit:        form.unit.trim() || null,
    goal:        parseFloat(form.goal),
    atRiskBelow: parseFloat(form.atRiskBelow),
    aggregation: form.aggregation,
  };
  body.watchBelow = form.watchBelow.trim() ? parseFloat(form.watchBelow) : null;
  if (isNaN(body.goal as number) || isNaN(body.atRiskBelow as number)) return { error: NUMBERS_INVALID };
  return { body };
}

/** POST body for a new one; watchBelow only when given. */
export function createBody(form: NewMetricForm): { body: Record<string, unknown> } | { error: string } {
  if (!form.name.trim() || !form.slug.trim() || !form.goal || !form.atRiskBelow) return { error: REQUIRED };
  const goal = parseFloat(form.goal);
  const atRiskBelow = parseFloat(form.atRiskBelow);
  if (isNaN(goal) || isNaN(atRiskBelow)) return { error: NUMBERS_INVALID };
  const body: Record<string, unknown> = {
    name:        form.name.trim(),
    slug:        form.slug.trim(),
    unit:        form.unit.trim() || null,
    goal,
    atRiskBelow,
    aggregation: form.aggregation,
  };
  if (form.watchBelow.trim()) body.watchBelow = parseFloat(form.watchBelow);
  return { body };
}

/** "Goal: 10 hrs · At risk below: 5 · Average per member", as the web's text runs
 *  (joining them shifts WebKit's shaping). */
export const metricSub = (def: MetricDefLike): string[] =>
  ["Goal: ", String(def.goal), def.unit ? ` ${def.unit}` : "", " · At risk below: ", String(def.atRiskBelow), " · ", AGGREGATION_LABELS[def.aggregation]];

export const METRICS_COPY = {
  lede: "Define org-specific tracked metrics beyond the built-ins. Values are entered per member in the member drawer.",
  loading: "Loading…",
  emptyTitle: "No custom metrics yet",
  emptyHint: "Add one to start tracking additional data.",
  maxed: "Maximum of 20 custom metrics reached.",
  add: "Add metric",
  newMetric: "New metric",
  edit: "Edit",
  remove: "Remove",
  removing: "Removing…",
  removeTitle: (name: string) => `Remove "${name}"?`,
  removeMessage: "Values already recorded against this metric are kept, but the metric stops appearing on the dashboard and in member profiles.",
  name: "Name",
  nameReq: "Name *",
  namePlaceholder: "Practice Reps",
  slugReq: "Slug *",
  slugPlaceholder: "practice-reps",
  unit: "Unit (optional)",
  unitPlaceholder: "hrs, reps, %…",
  goal: "Goal (per member)",
  goalReq: "Goal (per member) *",
  atRisk: "At Risk below",
  atRiskReq: "At Risk below *",
  watch: "Watch below (optional)",
  optional: "optional",
  headline: "KPI card headline",
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  create: "Create metric",
  creating: "Creating…",
  loadFailed: "Failed to load custom metrics",
  saveFailed: "Failed to save metric",
  deleteFailed: "Failed to delete metric",
  createFailed: "Failed to create metric",
  created: (name: string) => `Custom metric "${name}" created`,
  removed: "Metric removed",
};
