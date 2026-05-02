"use client"

import { useState } from "react"

export function ReferralLinkBanner({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="mt-10 overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Invite a friend, earn rewards</h2>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Share Relay and earn commission when they upgrade. Referees get 20% off their first paid month.
        </p>
      </div>
      <div className="border-t border-[var(--relay-line)] px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 overflow-hidden text-ellipsis rounded bg-[var(--relay-soft)] px-3 py-2 text-[12px] text-[var(--relay-ink)]">
            {link}
          </code>
          <button
            type="button"
            onClick={copy}
            className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-2 text-[12px] font-medium text-[var(--relay-muted)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)] whitespace-nowrap"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>
    </section>
  )
}
