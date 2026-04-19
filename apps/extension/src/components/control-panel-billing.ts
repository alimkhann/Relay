import type { RelayActiveProjectState } from "../messaging/contracts";

export type ExtensionDisplayedPlan = "free" | "starter" | "pro" | null;

export function resolveDisplayedPlan(
  activeState: Pick<RelayActiveProjectState, "entitlements" | "lastBudgetStatus">,
): ExtensionDisplayedPlan {
  const entitlementPlan = activeState.entitlements?.plan;
  if (
    entitlementPlan === "free" ||
    entitlementPlan === "starter" ||
    entitlementPlan === "pro"
  ) {
    return entitlementPlan;
  }

  const budgetPlan = activeState.lastBudgetStatus?.plan;
  if (
    budgetPlan === "free" ||
    budgetPlan === "starter" ||
    budgetPlan === "pro"
  ) {
    return budgetPlan;
  }

  return null;
}
