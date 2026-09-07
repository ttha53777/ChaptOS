import { CheckInStatus } from "@/lib/state/checkin-status";

// PURE MODULE — imported by client components. Do not import lib/db, lib/errors,
// or anything that reaches Prisma from here: a server-only import pulled into a
// browser-reachable module 500s the dev server while tsc and vitest stay green
// (see lib/org-types.ts for the split-file precedent).

/** A window left open auto-expires an hour after it was opened. */
export const CHECKIN_WINDOW_MS = 60 * 60 * 1000;

/** The last stretch of the window renders as "closing" (gold, not violet). */
export const CHECKIN_CLOSING_MS = 5 * 60 * 1000;

/** The window's timestamps, as carried by CalendarEvent. */
export type CheckInWindow = {
  checkInOpenedAt: Date | string | null;
  checkInClosedAt: Date | string | null;
};

function asTime(value: Date | string | null): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The window's state, or null when it was never opened (the common case).
 *
 * An expired-but-unclosed window READS as closed without any write. That is
 * deliberate: nobody can still check in, but the absence rows are only written
 * when an officer actually closes it, so a forgotten window fails in the safe
 * direction (attendance simply isn't recorded, rather than everyone being
 * marked absent by a timer nobody watched).
 */
export function checkInState(
  event: CheckInWindow,
  now: Date = new Date(),
): CheckInStatus | null {
  const opened = asTime(event.checkInOpenedAt);
  if (opened === null) return null;
  if (asTime(event.checkInClosedAt) !== null) return CheckInStatus.Closed;

  const remaining = opened + CHECKIN_WINDOW_MS - now.getTime();
  if (remaining <= 0) return CheckInStatus.Closed;
  if (remaining <= CHECKIN_CLOSING_MS) return CheckInStatus.Closing;
  return CheckInStatus.Open;
}

/** Whether the window still accepts check-ins. "closing" still does. */
export function acceptsCheckIns(state: CheckInStatus | null): boolean {
  return state === CheckInStatus.Open || state === CheckInStatus.Closing;
}

/** Milliseconds until the window auto-expires; 0 once it has. */
export function checkInMsRemaining(
  event: CheckInWindow,
  now: Date = new Date(),
): number {
  const opened = asTime(event.checkInOpenedAt);
  if (opened === null || asTime(event.checkInClosedAt) !== null) return 0;
  return Math.max(0, opened + CHECKIN_WINDOW_MS - now.getTime());
}
