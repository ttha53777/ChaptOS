// Recharts-free color helpers for treasury visuals. Kept in their own module so
// importing `catColor` (from page.tsx / BudgetView) does NOT pull the recharts
// bundle — that would defeat the dynamic() code-split of the chart components.

// Dusk ledger ramp — violet lead, then gold / rose / sage semantics, then muted tints.
export const DONUT_COLORS = [
  "#a78bfa", "#ddb36a", "#d98ba3", "#7fb08a",
  "#7c3aed", "#c9a24a", "#b86b85", "#5f8a6a",
];

/**
 * A slice's color: the category's own stored hex when it has one, else a position
 * on the ramp.
 *
 * The stored color is what keeps a category the same color as slices reorder —
 * ramp position alone means "Operations" changes color the month it stops being
 * the biggest expense. The fallback still matters: the synthetic "Other" slice and
 * any row whose category has since been deleted have no color to resolve.
 */
export function catColor(color: string | null | undefined, index: number): string {
  return color ?? DONUT_COLORS[index % DONUT_COLORS.length];
}
