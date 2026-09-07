// Live check-in window status. Derived at read time from CalendarEvent's
// checkInOpenedAt/checkInClosedAt timestamps — never stored in a column, so
// unlike the other status enums here it has no DB CHECK constraint.
//
// Closing is a real transition: it is the write that turns everyone who never
// checked in into a recorded absence. "closing" is only a display state (the
// last few minutes of the window) and accepts check-ins exactly like "open".
export const CheckInStatus = {
  Open: "open",
  Closing: "closing",
  Closed: "closed",
} as const;

export type CheckInStatus = (typeof CheckInStatus)[keyof typeof CheckInStatus];

export const CHECKIN_STATUSES: readonly CheckInStatus[] = Object.values(CheckInStatus);

export function isCheckInStatus(value: unknown): value is CheckInStatus {
  return typeof value === "string" && (CHECKIN_STATUSES as readonly string[]).includes(value);
}
