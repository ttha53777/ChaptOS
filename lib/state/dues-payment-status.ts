export const DuesPaymentStatus = {
  Pending:  "pending",
  Approved: "approved",
  Rejected: "rejected",
} as const;

export type DuesPaymentStatus = (typeof DuesPaymentStatus)[keyof typeof DuesPaymentStatus];

export const DUES_PAYMENT_STATUSES: readonly DuesPaymentStatus[] = Object.values(DuesPaymentStatus);

export function isDuesPaymentStatus(value: unknown): value is DuesPaymentStatus {
  return typeof value === "string" && (DUES_PAYMENT_STATUSES as readonly string[]).includes(value);
}
