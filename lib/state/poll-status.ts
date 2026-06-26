// Poll lifecycle status. Binary — a poll is open (accepting votes, results live)
// until a manager closes it. Closing locks voting but keeps results visible.
// There is no "draft": a poll is live the moment it's created.
export const PollStatus = {
  Open: "open",
  Closed: "closed",
} as const;

export type PollStatus = (typeof PollStatus)[keyof typeof PollStatus];

export const POLL_STATUSES: readonly PollStatus[] = Object.values(PollStatus);

export function isPollStatus(value: unknown): value is PollStatus {
  return typeof value === "string" && (POLL_STATUSES as readonly string[]).includes(value);
}
