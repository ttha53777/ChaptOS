/**
 * Member-status thresholds.
 *
 * These cutoffs decide every "At Risk" / "Watch" / "Good" badge and feed the
 * chapter health score. They live per-org in OrganizationConfig.thresholds (a
 * sparse JSON map) and fall back to DEFAULT_THRESHOLDS when an org hasn't set
 * its own. Read them in client components via the useThresholds() hook;
 * server code (the /me route, AI tools) resolves them with resolveThresholds().
 *
 * Mirrors the vocab system in lib/vocab.ts — same default-and-override shape so
 * a per-org value never has to be threaded through a module-level mutable.
 */

export interface Thresholds {
  /** Attendance % below which a member is flagged At Risk. */
  attendanceAtRisk: number;
  /** Attendance % below which a member is flagged Watch. */
  attendanceWatch: number;
  /** GPA below which a member is flagged At Risk. */
  gpaAtRisk: number;
  /** GPA below which a member is flagged Watch. */
  gpaWatch: number;
  /** Service-hours target each member is expected to hit. */
  serviceHoursGoal: number;
}

/** The keys an org may override, used by the sanitizer and the Zod schema. */
export const THRESHOLD_KEYS = [
  "attendanceAtRisk",
  "attendanceWatch",
  "gpaAtRisk",
  "gpaWatch",
  "serviceHoursGoal",
] as const;

/** App-wide fallback used when an org has no override for a given key. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  attendanceAtRisk: 65,
  attendanceWatch: 80,
  gpaAtRisk: 2.7,
  gpaWatch: 3.0,
  serviceHoursGoal: 10,
};

/** Reasonable bounds per key for validation (min/max, inclusive). */
const BOUNDS: Record<keyof Thresholds, { min: number; max: number }> = {
  attendanceAtRisk: { min: 0, max: 100 },
  attendanceWatch:  { min: 0, max: 100 },
  gpaAtRisk:        { min: 0, max: 4 },
  gpaWatch:         { min: 0, max: 4 },
  serviceHoursGoal: { min: 0, max: 1000 },
};

/**
 * Merge an org's sparse overrides onto the defaults, dropping any key that is
 * unknown or out of range so a malformed JSON column can never poison the UI.
 * Accepts `unknown` because the value comes straight off a Prisma Json column.
 */
export function resolveThresholds(overrides: unknown): Thresholds {
  const out: Thresholds = { ...DEFAULT_THRESHOLDS };
  if (!overrides || typeof overrides !== "object") return out;
  const src = overrides as Record<string, unknown>;
  for (const key of THRESHOLD_KEYS) {
    const v = src[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const { min, max } = BOUNDS[key];
    if (v < min || v > max) continue;
    out[key] = v;
  }
  return out;
}
