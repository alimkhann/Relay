"use client"

import { motion, useInView } from "motion/react"
import { useRef, useState } from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import { PRICING } from "../pricing.config"
import { cn } from "@/lib/cn"

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
  const isPro = "badge" in plan
  const price = yearly ? plan.yearlyPrice : plan.monthlyPrice
  const interval = plan.monthlyPrice === 0 ? "forever" : yearly ? "year" : "month"

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.5, delay, ease }}
      className={cn(
        "relative rounded-2xl border p-7 md:p-8 flex flex-col",
        isPro
          ? "border-white/[0.12] bg-[#131313]"
          : "border-white/[0.07] bg-[#111]"
      )}
    >
      {/* Badge — top right */}
      {isPro && (
        <span className="absolute top-6 right-6 text-[10px] tracking-[0.15em] font-medium text-white/60 uppercase px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.1]">
          {(plan as typeof PRICING.pro).badge}
        </span>
      )}

      <h3 className="text-xl font-semibold text-white">{plan.name}</h3>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-semibold text-white tracking-tight">
          ${price}
        </span>
        <span className="text-sm text-white/35">
          / {interval}
        </span>
      </div>

      {isPro && yearly && (
        <p className="mt-1.5 text-xs text-emerald-400/60">Save 17% yearly</p>
      )}

      <p className="mt-2 text-sm text-white/40">{plan.description}</p>

      <ul className="mt-7 space-y-3 flex-1">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check
              size={14}
              className={cn(
                "shrink-0 mt-0.5",
                isPro ? "text-white/50" : "text-white/50"
              )}
              strokeWidth={2}
            />
            <span className="text-sm text-white/55">{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/get-started"
        className={cn(
          "mt-8 inline-flex items-center justify-center gap-1.5 rounded-full px-6 py-3 text-sm font-medium transition-colors duration-200",
          isPro
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
          <p className="text-[10px] tracking-[0.2em] font-medium text-white/30 uppercase mb-4">
            Pricing
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Simple, honest pricing.
          </h2>
        </motion.div>

        {/* Billing toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.4, delay: 0.1, ease }}
          className="flex items-center justify-center gap-3 mb-10"
        >
          <span className={cn("text-sm transition-colors", !yearly ? "text-white/80" : "text-white/35")}>
            Monthly
          </span>
          <button
            onClick={() => setYearly(!yearly)}
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
          {yearly && (
            <span className="text-[11px] text-emerald-400/60 font-medium ml-1">
              Save 17%
            </span>
          )}
        </motion.div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-4">
          <PricingCard plan={PRICING.free} yearly={yearly} inView={inView} delay={0.15} />
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
      </div>
    </section>
  )
}
