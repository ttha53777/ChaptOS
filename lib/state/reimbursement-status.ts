export const ReimbursementStatus = {
  Pending:  "pending",
  Approved: "approved",
  Rejected: "rejected",
} as const;

export type ReimbursementStatus = (typeof ReimbursementStatus)[keyof typeof ReimbursementStatus];

export const REIMBURSEMENT_STATUSES: readonly ReimbursementStatus[] = Object.values(ReimbursementStatus);

export function isReimbursementStatus(value: unknown): value is ReimbursementStatus {
  return typeof value === "string" && (REIMBURSEMENT_STATUSES as readonly string[]).includes(value);
}
