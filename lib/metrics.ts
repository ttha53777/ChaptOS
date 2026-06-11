/**
 * Custom metric types and pure helpers.
 * No DB imports — safe to import from server and client code.
 */

export interface CustomMetricDefinition {
  id:           number;
  organizationId: number;
  slug:         string;         // kebab-case, immutable after creation
  name:         string;         // display label, max 40 chars
  unit:         string | null;  // optional suffix: "hrs", "reps", "%" — null = bare number
  goal:         number;         // per-member target; "on track" means value >= goal
  atRiskBelow:  number;         // value < atRiskBelow → "at_risk"
  watchBelow:   number | null;  // optional: atRiskBelow <= value < watchBelow → "watch"
                                // without watchBelow: [atRiskBelow, goal) is the "watch" band
  aggregation:  "avg" | "sum" | "count_on_track";
  displayOrder: number;
  deletedAt:    string | null;
  createdAt:    string;
  updatedAt:    string;
}

export type MetricStatus = "on_track" | "watch" | "at_risk";

/**
 * Compute a member's status on a single metric.
 *
 * Tiers:
 *   value <  atRiskBelow               → "at_risk"
 *   atRiskBelow <= value < watchBelow  → "watch"   (when watchBelow set)
 *   atRiskBelow <= value <  goal       → "watch"   (when watchBelow not set)
 *   value >= goal                      → "on_track"
 */
export function getMetricStatus(
  value: number,
  def: Pick<CustomMetricDefinition, "goal" | "atRiskBelow" | "watchBelow">,
): MetricStatus {
  if (value >= def.goal) return "on_track";
  if (value < def.atRiskBelow) return "at_risk";
  if (def.watchBelow !== null && value >= def.watchBelow) return "watch";
  // no watchBelow: anything in [atRiskBelow, goal) is watch
  return "watch";
}

/**
 * Compute the dashboard KPI card headline number from an aggregation type.
 *
 *   "avg"            → average across all members with a recorded value
 *   "sum"            → total across all members
 *   "count_on_track" → number of members whose value >= goal
 *                      (rendered by KPICard as "N / totalCount on track")
 */
export function computeHeadline(
  aggregation: CustomMetricDefinition["aggregation"],
  stats: { avg: number | null; sum: number; onTrackCount: number },
): number {
  switch (aggregation) {
    case "avg":            return stats.avg ?? 0;
    case "sum":            return stats.sum;
    case "count_on_track": return stats.onTrackCount;
  }
}

/**
 * Snapshot of a single custom metric for the dashboard KPI card.
 * Built-ins and custom metrics both satisfy this shape in Phase 5+.
 */
export interface MetricSnapshot {
  definitionId:   number;
  slug:           string;
  name:           string;
  unit:           string | null;
  aggregation:    CustomMetricDefinition["aggregation"];
  /** Headline: avg value, sum, or onTrackCount depending on aggregation. */
  headline:       number;
  /** Reserved v2 — null in MVP. */
  trend:          number | null;
  /** Reserved v2 — empty array in MVP (requires history log table). */
  sparkData:      number[];
  onTrackCount:   number;
  watchCount:     number;
  atRiskCount:    number;
  /** Members with any recorded value. */
  totalCount:     number;
  goal:           number;
  atRiskBelow:    number;
  watchBelow:     number | null;
}
