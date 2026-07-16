// Recharts-free color helpers for treasury visuals. Kept in their own module so
// importing `catColor` (from page.tsx / BudgetView) does NOT pull the recharts
// bundle — that would defeat the dynamic() code-split of the chart components.

// Dusk ledger ramp — violet lead, then gold / rose / sage semantics, then muted tints.
export const DONUT_COLORS = [
  "#a78bfa", "#ddb36a", "#d98ba3", "#7fb08a",
  "#7c3aed", "#c9a24a", "#b86b85", "#5f8a6a",
];

export function catColor(name: string, index: number): string {
  return DONUT_COLORS[index % DONUT_COLORS.length];
}
