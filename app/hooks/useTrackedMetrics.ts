"use client";

import { useMemo } from "react";
import { useChapter } from "../context/ChapterContext";
import { resolveTrackedMetrics, type TrackedMetrics } from "@/lib/tracked-metrics";
import type { DisabledFeatures } from "@/lib/workflow-features";

/**
 * Which built-in per-member metrics the active org actually tracks.
 *
 * Parallels useFeature() / useVocab(): reads the org config from ChapterContext
 * and resolves through the shared lib helper so client and server can't drift.
 *
 * Use this to keep a metric an org switched off in onboarding from showing up
 * as a roster column, feeding the health score, or flagging members At Risk on
 * a value that was never recorded.
 *
 * Usage:
 *   const tracked = useTrackedMetrics();
 *   getBrotherStatus(b, thresholds, tracked)
 */
export function useTrackedMetrics(): TrackedMetrics {
  const { currentUser } = useChapter();
  const disabled = (currentUser?.org?.disabledFeatures ?? {}) as DisabledFeatures;

  return useMemo(
    () => resolveTrackedMetrics(disabled),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(disabled)],
  );
}
