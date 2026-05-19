"use client"

import { motion, useInView } from "motion/react"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import { PRICING } from "../pricing.config"
import { cn } from "@/lib/cn"
import { trackMarketingEvent } from "./analytics"

const ease = [0.25, 0.1, 0.25, 1] as const

function PricingCard({
  plan,
  yearly,
  inView,
  delay,
}: {
  plan: (typeof PRICING)[keyof typeof PRICING]
  yearly: boolean
  inView: boolean
  delay: number
}) {
  const isFeatured = plan.monthlyPrice > 0
  // When yearly: show per-month equivalent (yearlyPrice / 12), not total
  const price = plan.monthlyPrice === 0
    ? 0
    : yearly
      ? Math.round(plan.yearlyPrice / 12)
      : plan.monthlyPrice
  const interval = plan.monthlyPrice === 0 ? "forever" : "month"

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.5, delay, ease }}
      className={cn(
        "relative rounded-2xl border p-7 md:p-8 flex flex-col",
        isFeatured
          ? "border-white/[0.12] bg-[#131313]"
          : "border-white/[0.07] bg-[#111]"
      )}
    >
      <h3 className="text-xl font-semibold text-white">{plan.name}</h3>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-semibold text-white tracking-tight">
          ${price}
        </span>
        <span className="text-sm text-white/35">
          / {interval}
        </span>
        {yearly && plan.monthlyPrice > 0 && (
          <span className="ml-1 text-xs text-emerald-400/60">-17%</span>
        )}
      </div>

      <p className="mt-2 text-sm text-white/40">{plan.description}</p>

      <ul className="mt-7 space-y-3 flex-1">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check
              size={14}
              className={cn(
                "shrink-0 mt-0.5",
                isFeatured ? "text-white/50" : "text-white/50"
              )}
              strokeWidth={2}
            />
            <span className="text-sm text-white/55">{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={isFeatured ? "/get-started?upgrade=true" : "/get-started"}
        onClick={() => {
          trackMarketingEvent(isFeatured ? "billing_upgrade_clicked" : "get_started_clicked", {
            source: isFeatured ? "pricing_pro" : "pricing_free",
            plan: plan.name.toLowerCase(),
            interval: yearly ? "year" : "month",
          })
        }}
        className={cn(
          "mt-8 inline-flex items-center justify-center gap-1.5 rounded-full px-6 py-3 text-sm font-medium transition-colors duration-200",
          isFeatured
            ? "bg-white text-[#0a0a0a] hover:bg-white/90"
            : "border border-white/[0.15] text-white/70 hover:text-white hover:border-white/25"
        )}
      >
        {plan.cta}
      </Link>
    </motion.div>
  )
}

export function PricingSection() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })
  const [yearly, setYearly] = useState(false)

  useEffect(() => {
    if (!inView) return

    trackMarketingEvent("pricing_viewed", {
      source: "pricing_section",
    })
  }, [inView])

  return (
    <section id="pricing" className="bg-[#0a0a0a] py-24 md:py-32 px-5" ref={ref}>
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, ease }}
          className="text-center mb-10"
        >
          <p className="text-[10px] tracking-[0.2em] font-medium text-white/45 uppercase mb-4">
            Pricing
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Simple, honest pricing
          </h2>
          <p className="mt-3 text-sm text-white/40">
            Start free. Upgrade when Relay is part of how you work — no jargon, cancel anytime.
          </p>
        </motion.div>

        {/* Billing toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.4, delay: 0.1, ease }}
          className="relative flex items-center justify-center gap-3 mb-10"
        >
          <span className={cn("text-sm transition-colors", !yearly ? "text-white/80" : "text-white/35")}>
            Monthly
          </span>
          <button
            onClick={() => {
              trackMarketingEvent("pricing_interval_toggled", {
                source: "pricing_section",
                interval: yearly ? "month" : "year",
              })
              setYearly(!yearly)
            }}
            className={cn(
              "relative w-11 h-6 rounded-full transition-colors duration-200",
              yearly ? "bg-white/20" : "bg-white/10"
            )}
          >
            <div
              className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200",
                yearly ? "translate-x-[22px]" : "translate-x-0.5"
              )}
            />
          </button>
          <span className={cn("text-sm transition-colors", yearly ? "text-white/80" : "text-white/35")}>
            Yearly
          </span>
          <span className={cn("absolute left-[calc(50%+84px)] pl-2 text-[11px] font-medium transition-opacity whitespace-nowrap", yearly ? "text-emerald-400/60 opacity-100" : "opacity-0")}>
            Save 17%
          </span>
        </motion.div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <PricingCard plan={PRICING.free} yearly={yearly} inView={inView} delay={0.15} />
          <PricingCard plan={PRICING.starter} yearly={yearly} inView={inView} delay={0.2} />
          <PricingCard plan={PRICING.pro} yearly={yearly} inView={inView} delay={0.25} />
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.5, delay: 0.4, ease }}
          className="mt-6 text-center text-xs text-white/20"
        >
          * Pricing subject to change during beta. Early users keep their rate.
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.5, delay: 0.45, ease }}
          className="mt-3 text-center"
        >
          <Link
            href="/docs/plans"
            onClick={() => {
              trackMarketingEvent("docs_clicked", { source: "pricing_compare_limits" })
            }}
            className="text-xs font-medium text-white/50 transition hover:text-white/75"
          >
            Compare all limits
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
