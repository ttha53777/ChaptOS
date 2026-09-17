import { BillingMode, isSelectedPlan, type SelectedPlan } from "@/lib/state/billing-mode";
import { BILLING_BANDS, tierForCount } from "./tiers";

export function selectedBand(plan: SelectedPlan) {
  return BILLING_BANDS.find(b => b.id === plan)!;
}

/** Membership is usage; a selected plan's quantity represents purchased capacity. */
export function subscriptionBand(members: number, sub?: { billingMode?: string; selectedPlan?: string | null } | null) {
  return sub?.billingMode === BillingMode.Selected && isSelectedPlan(sub.selectedPlan)
    ? selectedBand(sub.selectedPlan) : tierForCount(members);
}
