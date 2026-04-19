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
            activeProjects: 10,
            historyRetentionDays: 365,
            captureMonthly: 3000,
            mcpReadDaily: 1000,
            mcpDeepReadDaily: 250,
            mcpWriteDaily: 250,
            aiAnalysesPerProjectDaily: 120,
            aiAnalysesPerUserDaily: 120,
            memoryItemsPerProject: 10000,
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
            historyRetentionDays: 90,
            captureMonthly: 1200,
            mcpReadDaily: 300,
            mcpDeepReadDaily: 60,
            mcpWriteDaily: 60,
            aiAnalysesPerProjectDaily: 60,
            aiAnalysesPerUserDaily: 60,
            memoryItemsPerProject: 4000,
          },
        },
        lastBudgetStatus: null,
      }),
    ).toBe("starter");
  });
});
