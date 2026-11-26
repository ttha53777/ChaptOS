/**
 * Push notification states. Each is CHECK-constrained in the DB
 * (20261126000001_push_notifications).
 */

/** What a member can switch push on or off for, per org. */
export const PushCategory = {
  /** Check-in opened (or reopened) for an event they're expected at. */
  Checkin:    "checkin",
  /** A task or poll that's now theirs. */
  Tasks:      "tasks",
  /** A new dues charge on their tab. */
  Dues:       "dues",
  /** A decision on their excuse. */
  Attendance: "attendance",
  /** Officer-only: someone asked to join (MANAGE_BROTHERS). */
  Requests:   "requests",
} as const;

export type PushCategory = (typeof PushCategory)[keyof typeof PushCategory];

export const PUSH_CATEGORIES: readonly PushCategory[] = Object.values(PushCategory);

export function isPushCategory(value: unknown): value is PushCategory {
  return typeof value === "string" && (PUSH_CATEGORIES as readonly string[]).includes(value);
}

/**
 * A queued push's category: one of the switchable ones, or "membership" for
 * "You're in", which always sends (the person has no preferences in that org yet).
 */
export const PUSH_MESSAGE_CATEGORIES = [...PUSH_CATEGORIES, "membership"] as const;
export type PushMessageCategory = (typeof PUSH_MESSAGE_CATEGORIES)[number];

export const PushMessageStatus = {
  Pending: "pending",
  Sent:    "sent",
  /** Gave up after repeated send failures. */
  Failed:  "failed",
  /** Expired before it could go, or nobody had a device. */
  Dropped: "dropped",
} as const;

export type PushMessageStatus = (typeof PushMessageStatus)[keyof typeof PushMessageStatus];

export const PushPlatform = { Ios: "ios", Android: "android" } as const;
export type PushPlatform = (typeof PushPlatform)[keyof typeof PushPlatform];
export const PUSH_PLATFORMS: readonly PushPlatform[] = Object.values(PushPlatform);
