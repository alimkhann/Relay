import { Check } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { DocsFooterNav } from "@/components/docs/docs-footer-nav"
import { PRICING } from "@/app/(marketing)/pricing.config"
import { FREE_LIMITS, PLAN_GLOSSARY, PLAN_LIMIT_ROWS, PRO_LIMITS, STARTER_LIMITS } from "@/server/services/billing-config"

const PLAN_TABLE_ROWS = PLAN_LIMIT_ROWS.map((row) => {
  if (row.key === "historyRetentionDays") {
    return {
      label: row.label,
      free: `${FREE_LIMITS.historyRetentionDays} days`,
      starter: "Included",
      pro: "Included",
    }
  }

  if (row.key === "aiAnalysesPerUserDaily") {
    return {
      label: row.label,
      free: `${FREE_LIMITS.aiAnalysesPerUserDaily} total`,
      starter: `${STARTER_LIMITS.aiAnalysesPerUserDaily} total`,
      pro: `${PRO_LIMITS.aiAnalysesPerUserDaily} total`,
    }
  }

  const formatValue = (value: number) => value.toLocaleString("en-US")
  return {
    label: row.label,
    free: formatValue(FREE_LIMITS[row.key]),
    starter: formatValue(STARTER_LIMITS[row.key]),
    pro: formatValue(PRO_LIMITS[row.key]),
  }
})

const SOURCE_LIMIT_ROWS = [
  {
    label: "Source file size",
    free: "10 MB",
    starter: "50 MB",
    pro: "100 MB",
  },
  {
    label: "Total source storage",
    free: "50 MB",
    starter: "1 GB",
    pro: "5 GB",
  },
  {
    label: "Embedded source tokens / month",
    free: FREE_LIMITS.sourceEmbeddedTokensMonthly.toLocaleString("en-US"),
    starter: STARTER_LIMITS.sourceEmbeddedTokensMonthly.toLocaleString("en-US"),
    pro: PRO_LIMITS.sourceEmbeddedTokensMonthly.toLocaleString("en-US"),
  },
  {
    label: "Source ingestions / day",
    free: FREE_LIMITS.sourceIngestionsDaily.toLocaleString("en-US"),
    starter: STARTER_LIMITS.sourceIngestionsDaily.toLocaleString("en-US"),
    pro: PRO_LIMITS.sourceIngestionsDaily.toLocaleString("en-US"),
  },
  {
    label: "Source-backed recall / day",
    free: FREE_LIMITS.sourceBackedRecallDaily.toLocaleString("en-US"),
    starter: STARTER_LIMITS.sourceBackedRecallDaily.toLocaleString("en-US"),
    pro: PRO_LIMITS.sourceBackedRecallDaily.toLocaleString("en-US"),
  },
  {
    label: "OCR pages / month",
    free: "Not included",
    starter: "Not included",
    pro: "Not included",
  },
]

export default function PlansDocsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--relay-ink)]">Plans &amp; limits</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
          Three simple tiers: Free to try it out, Starter for everyday use, and Pro for heavier
          solo workflows. New to the terms below? See the plain-language guide.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">
          What these mean
        </h2>
        <dl className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] divide-y divide-[var(--relay-line)]">
          {PLAN_GLOSSARY.map((entry) => (
            <div key={entry.term} className="px-4 py-3">
              <dt className="text-[14px] font-semibold text-[var(--relay-ink)]">{entry.term}</dt>
              <dd className="mt-0.5 text-[13px] leading-relaxed text-[var(--relay-muted)]">{entry.plain}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Included on every plan</h2>
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-4">
          <ul className="space-y-2 text-[14px] text-[var(--relay-muted)]">
            <li>Browser capture across supported AI tools</li>
            <li>Project context and continuity briefs</li>
            <li>Chrome extension and MCP access</li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Plan comparison</h2>
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
          <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--relay-line)]">
                <th className="px-4 py-3 text-left font-semibold text-[var(--relay-ink)]">Limit</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--relay-ink)]">Free</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--relay-ink)]">Starter</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--relay-ink)]">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--relay-line)]">
              {[
                ...PLAN_TABLE_ROWS,
                ...SOURCE_LIMIT_ROWS,
                {
                  label: "Relay agent",
                  free: `${FREE_LIMITS.assistantMessagesMonthly} / month`,
                  starter: `${STARTER_LIMITS.assistantMessagesMonthly} / month · ${STARTER_LIMITS.assistantMessagesDaily} / day`,
                  pro: `${PRO_LIMITS.assistantMessagesMonthly} / month · ${PRO_LIMITS.assistantMessagesDaily} / day`,
                },
                {
                  label: "Agent token safety cap / month",
                  free: FREE_LIMITS.assistantTokensMonthly.toLocaleString("en-US"),
                  starter: STARTER_LIMITS.assistantTokensMonthly.toLocaleString("en-US"),
                  pro: PRO_LIMITS.assistantTokensMonthly.toLocaleString("en-US"),
                },
                {
                  label: "Agent max steps / turn",
                  free: FREE_LIMITS.assistantMaxSteps.toLocaleString("en-US"),
                  starter: STARTER_LIMITS.assistantMaxSteps.toLocaleString("en-US"),
                  pro: PRO_LIMITS.assistantMaxSteps.toLocaleString("en-US"),
                },
                { label: "Autonomous context", free: "—", starter: "Yes", pro: "Yes" },
                { label: "High-quality model", free: "—", starter: "—", pro: "Yes" },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="px-4 py-3 text-[var(--relay-muted)]">{row.label}</td>
                  <td className="px-4 py-3 text-right text-[var(--relay-muted)]">{row.free}</td>
                  <td className="px-4 py-3 text-right text-[var(--relay-muted)]">{row.starter}</td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--relay-ink)]">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <p className="text-[13px] text-[var(--relay-muted)]">
          Reads and writes are account-level action limits shared across Relay surfaces. Passive dashboard loading, cache refreshes, background sync, and internal Relay agent tool calls do not consume them.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Features</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-4">
            <h3 className="text-[14px] font-semibold text-[var(--relay-ink)]">{PRICING.free.name}</h3>
            <p className="mt-1 text-[12px] text-[var(--relay-muted)]">{PRICING.free.description}</p>
            <ul className="mt-3 space-y-2">
              {PRICING.free.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-[var(--relay-muted)]">
                  <Check className="h-3.5 w-3.5 text-[var(--relay-muted)] mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] ring-1 ring-[var(--relay-accent)]/20 bg-[var(--relay-surface)] p-4">
            <h3 className="text-[14px] font-semibold text-[var(--relay-ink)]">{PRICING.starter.name}</h3>
            <p className="mt-1 text-[12px] text-[var(--relay-muted)]">{PRICING.starter.description}</p>
            <ul className="mt-3 space-y-2">
              {PRICING.starter.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-[var(--relay-muted)]">
                  <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-4">
            <h3 className="text-[14px] font-semibold text-[var(--relay-ink)]">{PRICING.pro.name}</h3>
            <p className="mt-1 text-[12px] text-[var(--relay-muted)]">{PRICING.pro.description}</p>
            <ul className="mt-3 space-y-2">
              {PRICING.pro.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-[var(--relay-muted)]">
                  <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-soft)] px-5 py-4">
        <p className="text-[14px] font-medium text-[var(--relay-ink)]">Ready to upgrade?</p>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Open the <Link href="/settings?section=billing" className="text-[var(--relay-accent)] underline underline-offset-2">Billing</Link> section in your dashboard to switch plans or manage your subscription.
        </p>
      </div>

      <Suspense fallback={null}>
        <DocsFooterNav previous={{ href: "/docs/extension", label: "Chrome Extension" }} next={{ href: "/docs/api", label: "API Reference" }} />
      </Suspense>
    </div>
  )
}
