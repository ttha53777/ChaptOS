/**
 * Dues ↔ ledger vocabulary and rollups.
 *
 * Brother.duesOwed is a stored balance, but it is no longer a free-text field:
 * the only two things that move it are recordDuesPayment (which mints the
 * matching income row in the same DB transaction) and adjustDues (which changes
 * the receivable and deliberately writes no ledger row). See lib/services/dues-service.ts.
 *
 * This module owns the one thing both sides must agree on — what a dues payment
 * *is* in the ledger — plus the aggregation that lets us check they still do.
 */
import { db } from "@/lib/db";
import { TransactionStatus, TransactionType } from "@/lib/state";

/** Org-scoped data accessor (same shape as ctx.db). */
type Scoped = ReturnType<typeof db>;

/**
 * The STORED category of a dues income row.
 *
 * Not to be confused with the *displayed* word for dues, which is org-renameable
 * via lib/vocab.ts ("Membership Fees", "Contributions", …). The stored value must
 * always be this literal: an org that renames dues and then writes rows under the
 * new label would orphan its own history, and every existing dues aggregation
 * (lib/ai-prompt.ts, the budget page, the reconciliation below) would silently
 * stop matching the rows it is supposed to sum. Display uses vocab; storage uses this.
 */
export const DUES_CATEGORY = "Dues";

/** The `where` that defines "money a member actually paid in dues". */
export const duesPaymentWhere = {
  type:      TransactionType.Income,
  category:  DUES_CATEGORY,
  status:    TransactionStatus.Posted,
  deletedAt: null,
} as const;

/**
 * Dues actually collected, per member, from the ledger.
 *
 * Members with no dues payments are absent from the map (not zero) — callers
 * should `?? 0`. Rows with a null brotherId are excluded by construction: they
 * are the pre-migration payments nobody can attribute, and they are surfaced
 * separately as `unattributed` rather than being silently folded into anyone's total.
 */
export async function sumDuesPaidByBrother(
  scoped: Scoped,
  brotherIds?: number[],
): Promise<Map<number, number>> {
  if (brotherIds?.length === 0) return new Map();

  const rows = await scoped.transaction.groupBy({
    by:    ["brotherId"],
    where: {
      ...duesPaymentWhere,
      ...(brotherIds ? { brotherId: { in: brotherIds } } : { brotherId: { not: null } }),
    },
    _sum:  { amount: true },
  });

  const paidByBrotherId = new Map<number, number>();
  for (const row of rows) {
    if (row.brotherId === null) continue;
    paidByBrotherId.set(row.brotherId, row._sum.amount ?? 0);
  }
  return paidByBrotherId;
}
