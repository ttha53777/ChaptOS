"use client";

import { useMemo } from "react";
import { useChapter } from "../context/ChapterContext";
import { useTrackedMetrics } from "./useTrackedMetrics";
import { resolveMeasuredMetrics, type TrackedMetrics } from "@/lib/tracked-metrics";

/**
 * The tracked metrics that have at least one record on this org's roster —
 * what a member's standing may be judged on. See resolveMeasuredMetrics.
 *
 * Reads the roster from ChapterContext, so it is all-false until the roster
 * loads; callers that render standing already wait for the roster.
 *
 * Usage:
 *   const measured = useMeasuredMetrics();
 *   getBrotherStatus(b, thresholds, measured)
 */
export function useMeasuredMetrics(): TrackedMetrics {
  const { brotherList } = useChapter();
  const tracked = useTrackedMetrics();
  return useMemo(() => resolveMeasuredMetrics(tracked, brotherList), [tracked, brotherList]);
}
