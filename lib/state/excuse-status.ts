export const ExcuseStatus = {
  Pending:  "pending",
  Approved: "approved",
  Rejected: "rejected",
} as const;

export type ExcuseStatus = (typeof ExcuseStatus)[keyof typeof ExcuseStatus];

export const EXCUSE_STATUSES: readonly ExcuseStatus[] = Object.values(ExcuseStatus);

export function isExcuseStatus(value: unknown): value is ExcuseStatus {
  return typeof value === "string" && (EXCUSE_STATUSES as readonly string[]).includes(value);
}
