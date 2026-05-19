import { PLAN_MARKETING_COPY } from "@/server/services/billing-config"

export const PRICING = {
  free: {
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: "Try Relay free — no card needed",
    cta: "Get Started",
    ctaVariant: "outline" as const,
    features: PLAN_MARKETING_COPY.free.features,
  },
  starter: {
    name: "Starter",
    monthlyPrice: 6,
    yearlyPrice: 60,
    description: "For people who use AI tools every day",
    cta: "Get Starter",
    ctaVariant: "primary" as const,
    features: PLAN_MARKETING_COPY.starter.features,
  },
  pro: {
    name: "Pro",
    monthlyPrice: 12,
    yearlyPrice: 120,
    description: "For heavy users who want the most automation",
    cta: "Get Pro",
    ctaVariant: "outline" as const,
    features: PLAN_MARKETING_COPY.pro.features,
  },
} as const
