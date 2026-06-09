"use client";

import { useCallback } from "react";
import { useChapter } from "../context/ChapterContext";
import { isFeatureEnabled, type DisabledFeatures } from "@/lib/workflow-features";
import type { WorkflowId } from "@/lib/org-types";

/**
 * Returns a stable `feature(workflow, feature)` predicate that reports whether a
 * page section is enabled for the active org. A section is on unless an admin has
 * hidden it (OrganizationConfig.disabledFeatures) — the same opt-out polarity the
 * server enforces, sharing isFeatureEnabled so the two never drift.
 *
 * Parallels useVocab(): reads the org config from ChapterContext and resolves
 * through the shared lib helper.
 *
 * Usage:
 *   const feature = useFeature();
 *   {feature("operations", "health") && <ChapterMomentumWidget … />}
 */
export function useFeature() {
  const { currentUser } = useChapter();
  const disabled = (currentUser?.org?.disabledFeatures ?? {}) as DisabledFeatures;

  return useCallback(
    (workflow: WorkflowId, feature: string): boolean => isFeatureEnabled(workflow, feature, disabled),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(disabled)],
  );
}
