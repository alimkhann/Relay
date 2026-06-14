// Canonical plan prices + the public paywall plan list, shared by the web
// paywall and the extension paywall so prices never drift. Pure data — no
// server billing internals (those stay in apps/web/server). Prices are also
// enforced server-side at checkout; this is presentation only.

export const PLAN_PRICES = {
  starter: { monthly: 8, yearly: 80 },
  pro: { monthly: 12, yearly: 120 },
} as const

export type PaidPlanKey = "starter" | "pro"

export interface PaywallPlan {
  key: PaidPlanKey
  name: string
  monthly: number
  yearly: number
  badge: string | null
  cta: string
  /** Short, card-sized feature list for compact surfaces (e.g. the extension). */
  features: string[]
}

export const PAYWALL_PLANS: PaywallPlan[] = [
  {
    key: "starter",
    name: "Starter",
    monthly: PLAN_PRICES.starter.monthly,
    yearly: PLAN_PRICES.starter.yearly,
    badge: "Most Popular",
    cta: "Get Starter",
    features: [
      "Never re-explain a project to your AI again",
      "Long-term memory across your projects",
      "Context updates itself as you work",
      "Enough usage for daily AI work",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthly: PLAN_PRICES.pro.monthly,
    yearly: PLAN_PRICES.pro.yearly,
    badge: null,
    cta: "Get Pro",
    features: [
      "Everything in Starter, with the most headroom",
      "Highest limits everywhere",
      "Highest-quality model for briefs",
      "Relay agent without thinking about quotas",
    ],
  },
]
