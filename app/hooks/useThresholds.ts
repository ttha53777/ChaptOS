"use client";

import { useChapter } from "../context/ChapterContext";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/thresholds";

/**
 * Returns the active org's member-status thresholds (At-Risk/Watch cutoffs and
 * the service-hours goal). Falls back to DEFAULT_THRESHOLDS before the user
 * loads or when there's no active org.
 *
 * Mirrors useVocab(): a single read point so components never reach into the
 * raw `currentUser.org` shape. The /me route already resolves the column to a
 * complete object, so the returned value is always fully populated.
 *
 * Usage:
 *   const t = useThresholds();
 *   b.attendance < t.attendanceAtRisk
 *   getBrotherStatus(b, t)
 */
export function useThresholds(): Thresholds {
  const { currentUser } = useChapter();
  return currentUser?.org?.thresholds ?? DEFAULT_THRESHOLDS;
}
