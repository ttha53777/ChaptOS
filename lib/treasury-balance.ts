/**
 * The one definition of "what's in the account".
 *
 * This formula was duplicated in four places — the dashboard's /api/treasury, the
 * treasury page's live client-side recompute, and both AI surfaces — each of which
 * silently started from zero. Adding OrganizationConfig.openingBalance to four
 * copies is how they drift, so they all call this instead.
 *
 * `openingBalance` is null on an org nobody has asked yet, and null coerces to 0 —
 * which is exactly how the whole platform behaved before the column existed.
 */

export interface BalanceParts {
  /** OrganizationConfig.openingBalance. null = never set. */
  openingBalance: number | null;
  /** Sum of PartyEvent.doorRevenue — party income that never became a Transaction. */
  doorRevenue: number;
  /** Sum of posted, non-deleted income transactions. */
  income: number;
  /** Sum of posted, non-deleted expense transactions. */
  expense: number;
}

export function netBalance({ openingBalance, doorRevenue, income, expense }: BalanceParts): number {
  return (openingBalance ?? 0) + doorRevenue + income - expense;
}
