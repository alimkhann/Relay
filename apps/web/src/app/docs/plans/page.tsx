import { Check } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { DocsFooterNav } from "@/components/docs/docs-footer-nav"
import { PRICING } from "@/app/(marketing)/pricing.config"

export default function PlansDocsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--relay-ink)]">Plans &amp; limits</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
          Relay keeps the free plan generous for individuals and unlocks higher limits on Pro.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Included on every plan</h2>
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-4">
          <ul className="space-y-2 text-[14px] text-[var(--relay-muted)]">
            <li>Browser capture across supported AI tools</li>
            <li>Project briefs and continuity packets</li>
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
                <th className="px-4 py-3 text-right font-semibold text-[var(--relay-ink)]">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--relay-line)]">
              {[
                { label: "Active projects", free: "2", pro: "10" },
                { label: "History retention", free: "30 days", pro: "365 days" },
                { label: "Captures / month", free: "200", pro: "2,000" },
                { label: "AI analyses / day", free: "6 / project · 18 total", pro: "32 / project · 120 total" },
                { label: "MCP reads / day", free: "20", pro: "200" },
                { label: "MCP writes / day", free: "5", pro: "50" },
                { label: "Handoff packs", free: "No", pro: "Yes" },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="px-4 py-3 text-[var(--relay-muted)]">{row.label}</td>
                  <td className="px-4 py-3 text-right text-[var(--relay-muted)]">{row.free}</td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--relay-ink)]">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Features</h2>
        <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[var(--relay-ink)]">{PRICING.pro.name}</h3>
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--relay-accent)]">{PRICING.pro.badge}</span>
            </div>
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
