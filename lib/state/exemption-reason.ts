export const ExemptionReason = {
  Abroad:   "abroad",
  Coop:     "coop",
  Inactive: "inactive",
  Other:    "other",
} as const;

export type ExemptionReason = (typeof ExemptionReason)[keyof typeof ExemptionReason];

export const EXEMPTION_REASONS: readonly ExemptionReason[] = Object.values(ExemptionReason);

export function isExemptionReason(value: unknown): value is ExemptionReason {
  return typeof value === "string" && (EXEMPTION_REASONS as readonly string[]).includes(value);
}
