/** Existing subscriptions remain automatic; selected plans reserve fixed capacity. */
export const BillingMode = { Automatic: "automatic", Selected: "selected" } as const;
export type BillingMode = (typeof BillingMode)[keyof typeof BillingMode];
export const BILLING_MODES: readonly BillingMode[] = Object.values(BillingMode);
export function isBillingMode(value: unknown): value is BillingMode {
  return typeof value === "string" && (BILLING_MODES as readonly string[]).includes(value);
}
export const SelectedPlan = { Standard: "standard", Pro: "pro" } as const;
export type SelectedPlan = (typeof SelectedPlan)[keyof typeof SelectedPlan];
export function isSelectedPlan(value: unknown): value is SelectedPlan {
  return value === SelectedPlan.Standard || value === SelectedPlan.Pro;
}
