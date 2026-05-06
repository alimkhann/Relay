import { describe, expect, it } from "vitest";

import { resolveDisplayedPlan } from "./control-panel-billing";

describe("resolveDisplayedPlan", () => {
  it("prefers billing entitlements when they are present", () => {
    expect(
      resolveDisplayedPlan({
        entitlements: {
          plan: "pro",
          status: "active",
          interval: "month",
          isPaid: true,
          isPro: true,
          isTrialing: false,
          trialEndsAt: null,
          currentPeriodEnd: null,
          features: {
            browserCapture: true,
            mcpRead: true,
            mcpWrite: true,
            handoffPacks: true,
            autonomousCanon: true,
            highQualityModel: true,
          },
          limits: {
            activeProjects: 15,
            historyRetentionDays: 3650,
            captureMonthly: 1000,
            mcpReadDaily: 300,
            mcpDeepReadDaily: 20,
            mcpWriteDaily: 60,
            aiAnalysesPerProjectDaily: 60,
            aiAnalysesPerUserDaily: 60,
            memoryItemsPerProject: 5000,
          },
        },
        lastBudgetStatus: {
          aiUsed: 1,
          aiLimit: 120,
          aiRemaining: 119,
          plan: "free",
        },
      }),
    ).toBe("pro");
  });

  it("falls back to the last known budget plan when entitlements are missing", () => {
    expect(
      resolveDisplayedPlan({
        entitlements: null,
        lastBudgetStatus: {
          aiUsed: 5,
          aiLimit: 120,
          aiRemaining: 115,
          plan: "pro",
        },
      }),
    ).toBe("pro");
  });

  it("returns null when billing state is unknown", () => {
    expect(
      resolveDisplayedPlan({
        entitlements: null,
        lastBudgetStatus: null,
      }),
    ).toBeNull();
  });

  it("keeps free and starter plans eligible for upgrade prompts", () => {
    expect(
      resolveDisplayedPlan({
        entitlements: null,
        lastBudgetStatus: {
          aiUsed: 5,
          aiLimit: 32,
          aiRemaining: 27,
          plan: "free",
        },
      }),
    ).toBe("free");

    expect(
      resolveDisplayedPlan({
        entitlements: {
          plan: "starter",
          status: "active",
          interval: "month",
          isPaid: true,
          isPro: false,
          isTrialing: false,
          trialEndsAt: null,
          currentPeriodEnd: null,
          features: {
            browserCapture: true,
            mcpRead: true,
            mcpWrite: true,
            handoffPacks: true,
            autonomousCanon: true,
            highQualityModel: false,
          },
          limits: {
            activeProjects: 5,
            historyRetentionDays: 3650,
            captureMonthly: 500,
            mcpReadDaily: 120,
            mcpDeepReadDaily: 8,
            mcpWriteDaily: 20,
            aiAnalysesPerProjectDaily: 25,
            aiAnalysesPerUserDaily: 25,
            memoryItemsPerProject: 1000,
          },
        },
        lastBudgetStatus: null,
      }),
    ).toBe("starter");
  });
});
