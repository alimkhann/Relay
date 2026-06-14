import { useState } from "react"
import { PAYWALL_PLANS, type PaidPlanKey } from "@relay/shared/constants/pricing"

import styles from "./paywall-cards.module.css"

const BILLING_BASE = "https://www.onrelay.app/settings?section=billing"

type Interval = "month" | "year"

function openCheckout(plan: PaidPlanKey, interval: Interval) {
  const url = `${BILLING_BASE}&plan=${plan}&interval=${interval}`
  void chrome.tabs.create({ url, active: true })
}

interface PaywallCardsProps {
  /** Called when the user chooses to stay on the free plan. */
  onContinueFree: () => void
  /** Optional back affordance (onboarding step navigation). */
  onBack?: () => void
  /** Compact layout for the narrow sidebar. */
  compact?: boolean
}

/**
 * Extension-native paywall — parity with the dashboard PaywallPlanCards (which
 * can't be imported across the Tailwind/Plasmo boundary). Monthly/annual toggle,
 * the two paid cards from the shared PAYWALL_PLANS, and a low-emphasis
 * "continue free" link. Checkout opens the web billing page in a new tab.
 */
export function PaywallCards({ onContinueFree, onBack, compact }: PaywallCardsProps) {
  const [interval, setInterval] = useState<Interval>("year")

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ""}`}>
      <div className={styles.toggle} role="tablist" aria-label="Billing interval">
        <button
          type="button"
          role="tab"
          aria-selected={interval === "month"}
          className={`${styles.toggleBtn} ${interval === "month" ? styles.toggleActive : ""}`}
          onClick={() => setInterval("month")}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={interval === "year"}
          className={`${styles.toggleBtn} ${interval === "year" ? styles.toggleActive : ""}`}
          onClick={() => setInterval("year")}
        >
          Yearly
          <span className={styles.savePill}>2 months free</span>
        </button>
      </div>

      <div className={styles.cards}>
        {PAYWALL_PLANS.map((plan) => {
          const price = interval === "year" ? plan.yearly : plan.monthly
          const unit = interval === "year" ? "/yr" : "/mo"
          return (
            <div key={plan.key} className={`${styles.card} ${plan.badge ? styles.cardFeatured : ""}`}>
              {plan.badge ? <span className={styles.badge}>{plan.badge}</span> : null}
              <div className={styles.planName}>{plan.name}</div>
              <div className={styles.price}>
                <span className={styles.priceAmount}>${price}</span>
                <span className={styles.priceUnit}>{unit}</span>
              </div>
              <ul className={styles.features}>
                {plan.features.map((feature) => (
                  <li key={feature} className={styles.feature}>
                    <svg className={styles.check} width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 7.5L5.5 11L12 3.5" />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`${styles.cta} ${plan.badge ? styles.ctaPrimary : ""}`}
                onClick={() => openCheckout(plan.key, interval)}
              >
                {plan.cta}
              </button>
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        {onBack ? (
          <button type="button" className={styles.backLink} onClick={onBack}>
            ← Back
          </button>
        ) : <span />}
        <button type="button" className={styles.freeLink} onClick={onContinueFree}>
          Continue with the free plan
        </button>
      </div>
    </div>
  )
}
