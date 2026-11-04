import type { db } from "@/lib/db";
import { resolveThresholds, type Thresholds } from "@/lib/thresholds";
import { resolveMeasuredMetrics, resolveTrackedMetrics, type TrackedMetrics } from "@/lib/tracked-metrics";
import type { DisabledFeatures } from "@/lib/workflow-features";

/**
 * Server-side inputs to a member's standing — the same three things the roster
 * page judges on: the org's thresholds, the metrics it tracks, and which of
 * those have a record behind them anywhere on the roster (`measured`).
 *
 * Without `measured`, Ask Chapt and the peek card call a brand-new org's first
 * invitees "At Risk" off a 0% / 0.00 nobody entered, while the roster beside
 * them says "not yet". See resolveMeasuredMetrics.
 */
type Scoped = ReturnType<typeof db>;

export interface StandingConfig {
  thresholds: Thresholds;
  tracked: TrackedMetrics;
}

/** Thresholds + tracked metrics, from the one OrganizationConfig row. */
export async function readStandingConfig(scoped: Scoped): Promise<StandingConfig> {
  const config = await scoped.organizationConfig.find();
  return {
    thresholds: resolveThresholds(config?.thresholds),
    tracked: resolveTrackedMetrics((config?.disabledFeatures ?? {}) as DisabledFeatures),
  };
}

/**
 * `measured` for callers that don't already hold the whole roster (a single
 * member's card, a handful of people). One aggregate instead of every row: the
 * per-metric extremes answer "does anyone have a record" exactly as the full
 * roster would. Ghosts are excluded, as listRoster excludes them.
 *
 * Not cached on purpose — this flips the moment the first meeting is recorded,
 * and a stale answer would keep "nothing recorded yet" up after it isn't true.
 */
export async function rosterMeasured(scoped: Scoped, tracked: TrackedMetrics): Promise<TrackedMetrics> {
  const agg = await scoped.member.aggregate({
    where: { brother: { is: { isGhost: false } } },
    _max: { attendance: true, gpa: true, serviceHours: true, duesOwed: true },
    _min: { duesOwed: true },
  });
  // Two stand-in rows carry the extremes through the shared rule, so the
  // "what counts as a record" logic lives in one place. The min row exists only
  // for a credit balance (duesOwed < 0), which also counts as dues data.
  return resolveMeasuredMetrics(tracked, [
    {
      attendance:   agg._max?.attendance ?? 0,
      gpa:          agg._max?.gpa ?? 0,
      serviceHours: agg._max?.serviceHours ?? 0,
      duesOwed:     agg._max?.duesOwed ?? 0,
    },
    { attendance: 0, gpa: 0, serviceHours: 0, duesOwed: agg._min?.duesOwed ?? 0 },
  ]);
}
