/**
 * Where a JoinRequest stands. CHECK-constrained in the DB
 * (join_request_status_check, 20260807000000_add_join_request).
 *
 * `rejected` is not a terminal tombstone — the row stays and can be revived.
 * Re-opening the SAME link while rejected is refused; opening a DIFFERENT link
 * an officer sent resets the row to `pending`. See lib/auth/join-request-submit.ts.
 */
export const JoinRequestStatus = {
  Pending:  "pending",
  Approved: "approved",
  Rejected: "rejected",
} as const;

export type JoinRequestStatus = (typeof JoinRequestStatus)[keyof typeof JoinRequestStatus];

export const JOIN_REQUEST_STATUSES: readonly JoinRequestStatus[] = Object.values(JoinRequestStatus);

export function isJoinRequestStatus(value: unknown): value is JoinRequestStatus {
  return typeof value === "string" && (JOIN_REQUEST_STATUSES as readonly string[]).includes(value);
}
