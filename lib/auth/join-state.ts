import { JoinRequestStatus } from "@/lib/state/join-request-status";

export type JoinState = "guest" | "ready" | "pending" | "rejected" | "already_member";

/** Shared precedence for pre-flight and submission. A token is never access. */
export function resolveJoinState(
  signedIn: boolean,
  isMember: boolean,
  request: { status: string; inviteId: number } | null,
  inviteId?: number,
): JoinState {
  if (!signedIn) return "guest";
  if (isMember) return "already_member";
  if (request?.status === JoinRequestStatus.Pending) return "pending";
  if (request?.status === JoinRequestStatus.Rejected && (inviteId === undefined || request.inviteId === inviteId)) return "rejected";
  return "ready";
}
