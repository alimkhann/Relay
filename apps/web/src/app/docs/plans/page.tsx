import Link from "next/link"
import { Suspense } from "react"

import { DocsFooterNav } from "@/components/docs/docs-footer-nav"

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
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">Included on every plan</h2>
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-4">
          <ul className="space-y-2 text-[14px] text-[var(--relay-muted)]">
            <li>Browser capture across supported AI tools</li>
            <li>Project briefs and continuity packets</li>
            <li>Chrome extension and MCP access</li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">Plan comparison</h2>
        <div className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
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
