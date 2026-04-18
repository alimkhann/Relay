import { PLAN_MARKETING_COPY } from "@/server/services/billing-config"

export const PRICING = {
  free: {
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: "Try Relay, no card needed",
    cta: "Get Started",
    ctaVariant: "outline" as const,
    features: PLAN_MARKETING_COPY.free.features,
  },
  starter: {
    name: "Starter",
    monthlyPrice: 12,
    yearlyPrice: 120,
    description: "For solo builders who live inside AI tools",
    cta: "Get Starter",
    ctaVariant: "primary" as const,
    features: PLAN_MARKETING_COPY.starter.features,
  },
  pro: {
    name: "Pro",
    monthlyPrice: 18,
    yearlyPrice: 180,
    description: "Full autonomy, deep continuity, every surface",
    cta: "Get Pro",
    ctaVariant: "outline" as const,
    features: PLAN_MARKETING_COPY.pro.features,
  },
} as const
