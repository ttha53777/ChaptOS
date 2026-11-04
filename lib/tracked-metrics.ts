import { isFeatureEnabled, type DisabledFeatures } from "./workflow-features";
import { BUILTIN_METRIC_IDS, type BuiltinMetricId } from "./onboarding/kinds";

/**
 * Built-in metric → the operations KPI widget it drives. An org that doesn't
 * track a built-in hides its widget via OrganizationConfig.disabledFeatures
 * (opt-out map), which is what provisionOrg writes from the interview's
 * per-member metrics answer.
 */
export const BUILTIN_METRIC_KPI: Record<BuiltinMetricId, string> = {
  attendance:   "kpi-attendance",
  gpa:          "kpi-gpa",
  duesOwed:     "kpi-dues",
  serviceHours: "kpi-service",
};

/** Which built-in per-member metrics an org actually tracks. */
export type TrackedMetrics = Record<BuiltinMetricId, boolean>;

/** Every built-in tracked — the default for orgs that never opted out of any. */
export const ALL_TRACKED: TrackedMetrics = {
  attendance: true, gpa: true, duesOwed: true, serviceHours: true,
};

/**
 * Resolve which built-in metrics an org tracks from its disabled-features map.
 *
 * This is the single source of truth behind the dashboard's org-type awareness:
 * a metric the org switched off in onboarding must not appear as a roster
 * column, must not contribute to the health score, and must not flag members
 * At Risk on a value nobody ever recorded.
 *
 * Built on isFeatureEnabled, so it inherits the opt-out polarity and its
 * fail-open behavior: an org with no disabledFeatures resolves to ALL_TRACKED
 * and behaves exactly as it did before this existed.
 */
export function resolveTrackedMetrics(disabled: DisabledFeatures | null | undefined): TrackedMetrics {
  const out = {} as TrackedMetrics;
  for (const id of BUILTIN_METRIC_IDS) {
    out[id] = isFeatureEnabled("operations", BUILTIN_METRIC_KPI[id], disabled);
  }
  return out;
}

/** How many per-member built-ins are tracked. */
export function trackedCount(tracked: TrackedMetrics): number {
  return BUILTIN_METRIC_IDS.filter(id => tracked[id]).length;
}

/**
 * Narrow `tracked` to the metrics with at least one record behind them anywhere
 * on the roster. A stored 0 is not a measurement: on a brand-new org every
 * member carries 0% attendance and a 0.00 GPA because nothing has been entered,
 * and judging those zeros greets the founder's first invitees with "at risk".
 * Anything reading a member's *standing* should take this, not `tracked`.
 *
 * Mirrors the dashboard's `measured` (app/[slug]/page.tsx), minus its treasury
 * tiebreak for dues — that only matters for display, and a balance above zero is
 * a record in its own right, so standing never needs it. Pass `booksHaveEntries`
 * where the treasury is loaded to match the dashboard exactly.
 *
 * On any org that has recorded something this is identity.
 */
export function resolveMeasuredMetrics(
  tracked: TrackedMetrics,
  roster: ReadonlyArray<{ attendance: number; gpa: number; serviceHours: number; duesOwed: number }>,
  opts: { booksHaveEntries?: boolean } = {},
): TrackedMetrics {
  return {
    // > 0 also skips the exempt sentinel (-1).
    attendance:   tracked.attendance   && roster.some(b => b.attendance > 0),
    gpa:          tracked.gpa          && roster.some(b => b.gpa > 0),
    duesOwed:     tracked.duesOwed     && (roster.some(b => b.duesOwed !== 0) || !!opts.booksHaveEntries),
    serviceHours: tracked.serviceHours && roster.some(b => b.serviceHours > 0),
  };
}

/** True when at least one tracked metric has a record behind it. */
export function anyMeasured(measured: TrackedMetrics): boolean {
  return BUILTIN_METRIC_IDS.some(id => measured[id]);
}
