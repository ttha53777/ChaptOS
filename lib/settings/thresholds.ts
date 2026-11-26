/**
 * Settings → Thresholds, as rules both clients run: the five cutoffs in their groups
 * (label, unit, step, bounds), the inline editor's check, the dirty test and every
 * sentence. Pure; the web's ThresholdsSection and the app's settings/Thresholds.tsx
 * render from it. Saved with PATCH /api/orgs/config { thresholds }.
 */
import { THRESHOLD_KEYS, type Thresholds } from "@/lib/thresholds";

export interface ThresholdRowSpec {
  label: string;
  field: keyof Thresholds;
  unit: string;
  step: number;
  min: number;
  max: number;
}

export const THRESHOLD_GROUPS: { label: string; rows: ThresholdRowSpec[] }[] = [
  {
    label: "Attendance",
    rows: [
      { label: "At risk below", field: "attendanceAtRisk", unit: "%", step: 1, min: 0, max: 100 },
      { label: "Watch below", field: "attendanceWatch", unit: "%", step: 1, min: 0, max: 100 },
    ],
  },
  {
    label: "GPA",
    rows: [
      { label: "At risk below", field: "gpaAtRisk", unit: "", step: 0.1, min: 0, max: 4 },
      { label: "Watch below", field: "gpaWatch", unit: "", step: 0.1, min: 0, max: 4 },
    ],
  },
  {
    label: "Service",
    rows: [
      { label: "Hours goal", field: "serviceHoursGoal", unit: "h", step: 1, min: 0, max: 1000 },
    ],
  },
];

/** The inline editor's commit: a number in range, or why not (the editor stays open). */
export function checkThreshold(draft: string, row: Pick<ThresholdRowSpec, "min" | "max" | "unit">): { value: number } | { error: string } {
  const num = parseFloat(draft);
  if (isNaN(num)) return { error: "Enter a number." };
  if (num < row.min || num > row.max) return { error: `Must be between ${row.min} and ${row.max}${row.unit}.` };
  return { value: num };
}

export const thresholdsDirty = (draft: Thresholds, persisted: Thresholds) => THRESHOLD_KEYS.some(k => draft[k] !== persisted[k]);

export const THRESHOLDS_COPY = {
  lede: "Click any value to edit it inline. These cutoffs apply to everyone in your org and drive the At-Risk / Watch badges and the health score. Saving updates the dashboard for all members.",
  save: "Save thresholds",
  saving: "Saving…",
  reset: "Reset to defaults",
  unsaved: "Unsaved",
  saved: "Thresholds saved for everyone in this org.",
  forbidden: "You need the Org settings permission to change thresholds.",
};
