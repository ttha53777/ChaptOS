/**
 * Money arithmetic and formatting, in one place.
 *
 * Amounts in this app are stored as `Float` dollars (`Transaction.amount`,
 * `Brother.duesOwed`, `Reimbursement.amount`, `Budget.carryoverBalance`). The
 * `amountCents` BigInt columns beside some of them are write-only mirrors that
 * nothing reads yet, so every balance the product shows is float arithmetic.
 *
 * That is liveable — dues are tens to hundreds of dollars, not fractions of a
 * cent — but only if every read rounds the same way and every comparison expects
 * drift. Before this module the identical `Math.round(n * 100) / 100` was
 * redefined five times (dues-service, transaction-service, app/data.ts,
 * ai-tools, and inline in the treasury route) and the formatters disagreed:
 * `fmt$` dropped the cents on a non-integer, so $1,234.50 rendered "$1,234.5".
 *
 * Pure module: no DB, no env, no Prisma. Safe to import on the client, same
 * posture as lib/billing/tiers.ts.
 *
 * ── Not to be confused with platform billing ─────────────────────────────────
 *
 * lib/billing/tiers.ts formats subscription prices, which are integer CENTS from
 * Stripe and never drift. This module is for the org's own books. Two different
 * kinds of money — see the note at the top of lib/services/billing-service.ts.
 */

/**
 * Half a cent, in dollars.
 *
 * The tolerance for "is this amount at least that amount?" on a float balance.
 * `Brother.duesOwed` is mutated by repeated `increment`/`decrement`, so a
 * balance that is conceptually $200.00 can be stored as 199.99999999999997 —
 * and a compare-and-set of `duesOwed >= 200` then refuses the member's exact,
 * honest payment with a message that reads "$200.00 exceeds $200.00".
 *
 * Half a cent is the right size: smaller than any amount anyone can enter (the
 * validators round to cents), larger than any plausible accumulation of float
 * error on balances of this magnitude. It admits the exact payment and still
 * refuses a real overpayment of one cent.
 */
export const CENT_EPSILON = 0.005;

/**
 * Round to cents. The one true definition — every read path should use it.
 *
 * Normalises negative zero. `Math.round(-0.000000000003 * 100) / 100` is `-0`,
 * which is `=== 0` and so slips through every guard, but is not `Object.is`-equal
 * to 0 and renders as "-0" if it ever reaches a formatter. A balance of minus
 * nothing is not a thing; collapse it here rather than at each call site.
 */
export function money(n: number): number {
  const rounded = Math.round(n * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/** Dollars → integer cents, for the BigInt mirror columns. */
export function toCents(n: number): number {
  return Math.round(n * 100);
}

/**
 * The floor to compare a float balance against when asking "can this cover
 * `amount`?". Use in a Prisma `gte` so drift can't refuse an exact payment.
 */
export function atLeast(amount: number): number {
  return money(amount) - CENT_EPSILON;
}

/**
 * "$1,234.50" / "$25" / "$0".
 *
 * Whole dollars stay whole — officers read "$200", not "$200.00" — and anything
 * with cents shows both digits rather than the one `toLocaleString` would give
 * you by default.
 */
export function fmtUsd(n: number): string {
  const rounded = money(n);
  return Number.isInteger(rounded)
    ? `$${rounded.toLocaleString("en-US")}`
    : `$${rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
