export const TransactionType = {
  Income:  "income",
  Expense: "expense",
} as const;

export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const TRANSACTION_TYPES: readonly TransactionType[] = Object.values(TransactionType);

export function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === "string" && (TRANSACTION_TYPES as readonly string[]).includes(value);
}
