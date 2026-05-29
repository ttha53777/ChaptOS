export const ActivityType = {
  Success: "success",
  Warning: "warning",
  Info:    "info",
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const ACTIVITY_TYPES: readonly ActivityType[] = Object.values(ActivityType);

export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}
