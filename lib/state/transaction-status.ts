// "posted" = the money has actually moved. "scheduled" = planned but not yet paid.
// DB CHECK: prisma/migrations/20260609000001_transaction_status.
export const TransactionStatus = {
  Posted:    "posted",
  Scheduled: "scheduled",
} as const;

export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const TRANSACTION_STATUSES: readonly TransactionStatus[] = Object.values(TransactionStatus);

export function isTransactionStatus(value: unknown): value is TransactionStatus {
  return typeof value === "string" && (TRANSACTION_STATUSES as readonly string[]).includes(value);
}
