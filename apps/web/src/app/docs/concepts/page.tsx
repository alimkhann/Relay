import Link from "next/link"
import { Suspense } from "react"

import { DocsFooterNav } from "@/components/docs/docs-footer-nav"

export default function ConceptsDocsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--relay-ink)]">Concepts</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
          Understanding how Relay organizes, scores, and delivers project context.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Projects</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          A <strong className="text-[var(--relay-ink)]">project</strong> is the top-level container in Relay. Each project has its own memory,
          briefs, and work sessions. Think of it as one codebase, one initiative, or one product.
          Free plans get 2 active projects; Pro gets 10.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Memory items</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Memory items are the atomic units of project context. Each item has a type:
        </p>
        <div className="divide-y divide-[var(--relay-line)] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
          {[
            { type: "decision", desc: "A choice that was made and should be remembered (e.g. 'We use Neon Auth, not Supabase')." },
            { type: "task", desc: "Something to be done or tracked (e.g. 'Add rate limiting to billing endpoints')." },
            { type: "constraint", desc: "A rule or limitation that must be respected (e.g. 'No floating promises — ESLint enforced')." },
            { type: "note", desc: "General context, observations, or knowledge worth preserving." },
            { type: "requirement", desc: "A user or product requirement that shapes implementation." },
            { type: "artifact", desc: "A reference to a file, URL, or other concrete artifact." },
          ].map((item) => (
            <div key={item.type} className="px-4 py-3">
              <code className="text-[13px] font-mono font-medium text-[var(--relay-ink)]">{item.type}</code>
              <p className="mt-0.5 text-[13px] text-[var(--relay-muted)]">{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Items can be tagged for search and pinned for priority inclusion in briefs.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Briefs</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          A <strong className="text-[var(--relay-ink)]">brief</strong> is a compiled snapshot of your project state, formatted for a specific
          AI tool. Relay generates briefs in two modes:
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-[15px] text-[var(--relay-muted)]">
          <li><strong className="text-[var(--relay-ink)]">Fresh chat bootstrap</strong> — Full context for starting a brand-new session.</li>
          <li><strong className="text-[var(--relay-ink)]">Quick continuity</strong> — A delta of what changed since your last sync.</li>
        </ul>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Briefs are target-aware: the same project state produces different output for Claude Code
          vs. ChatGPT based on token budgets and formatting conventions.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Work sessions</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          A <strong className="text-[var(--relay-ink)]">work session</strong> represents a continuous period of interaction with
          one tool. When you open a new coding session or chat, Relay tracks it as a work session
          with checkpoints for meaningful state changes. Sessions are used to compute deltas and
          provide continuity when you return.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Truth scoring</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Not all context is equal. Relay uses a multi-dimensional truth score that considers:
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-[15px] text-[var(--relay-muted)]">
          <li><strong className="text-[var(--relay-ink)]">Freshness</strong> — When the information was last updated or reaffirmed.</li>
          <li><strong className="text-[var(--relay-ink)]">Authority</strong> — Where the information came from (user input &gt; AI suggestion).</li>
          <li><strong className="text-[var(--relay-ink)]">Durability</strong> — Whether it&apos;s a stable decision or a tentative note.</li>
          <li><strong className="text-[var(--relay-ink)]">Evidence</strong> — Whether it&apos;s backed by code, tests, or repeated confirmation.</li>
          <li><strong className="text-[var(--relay-ink)]">Reaffirmation</strong> — How often the information has been validated across sessions.</li>
        </ul>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Higher-scored items get priority in briefs when token budgets are tight.
        </p>
      </section>

      <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-soft)] px-5 py-4">
        <p className="text-[14px] font-medium text-[var(--relay-ink)]">Need pricing details?</p>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          See <Link href="/docs/plans" className="text-[var(--relay-accent)] underline underline-offset-2">Plans &amp; limits</Link> for the full Free vs Pro comparison.
        </p>
      </div>

      <Suspense fallback={null}>
        <DocsFooterNav previous={{ href: "/docs/api", label: "API Reference" }} />
      </Suspense>
    </div>
  )
}
