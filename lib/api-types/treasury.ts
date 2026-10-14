// Money wire shapes. Type-only: see lib/api-types/index.ts for the rules.

// How money physically moved — the same everywhere, unlike the per-org categories.
export type PaymentMethod = "venmo" | "cash" | "check" | "invoice";

/** GET /api/reimbursements. */
export interface Reimbursement {
  id: number;
  brotherId: number;
  brother: { id: number; name: string; avatarUrl: string | null };
  amount: number;
  date: string;
  description: string;
  category?: string | null;
  status: "pending" | "approved" | "rejected";
  rejectionNote?: string | null;
  // The ledger row approval minted. Null until approved; null again if reversed.
  transactionId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DuesPayment {
  id: number;
  brotherId: number;
  brother: { id: number; name: string; avatarUrl: string | null };
  amount: number;
  date: string;
  paymentMethod?: string | null;
  status: "pending" | "approved" | "rejected";
  rejectionNote?: string | null;
  // The ledger row approval minted. Null until approved.
  transactionId?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/transactions. */
export interface Transaction {
  id: number;
  type: "income" | "expense";
  category: string;
  amount: number;
  date: string;
  description: string;
  paymentMethod?: string | null;
  semester?: string | null;
  status?: string;
  calendarEvents?: { id: number; title: string; date: string; category: string }[];
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/treasury. */
export interface TreasuryData {
  balance: number;
  projected: number;
  trend: { month: string; balance: number }[];
  /**
   * What was in the account when the org started keeping books here, or null if
   * nobody has been asked. Already folded into `balance` and `trend` server-side —
   * carried here so the treasury page's live client-side recompute can start from
   * the same number instead of zero.
   */
  openingBalance: number | null;
}

/**
 * GET /api/treasury/categories — one of the org's own income/expense streams.
 * The full set including hidden ones, because a transaction filed under an
 * archived category still has to render its label and color.
 */
export interface TransactionCategory {
  id: number;
  kind: "income" | "expense";
  /** The value stored in Transaction.category. What a <select> submits. */
  slug: string;
  /** The display name. The only thing a user should ever see. */
  label: string;
  color: string;
  colorDark: string | null;
  builtin: boolean;
  hidden: boolean;
  displayOrder: number;
}
