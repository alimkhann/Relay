import Link from "next/link"
import { Suspense } from "react"

import { DocsFooterNav } from "@/components/docs/docs-footer-nav"

export default function ConceptsDocsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--relay-ink)]">Concepts</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
          How Relay organizes, scores, and delivers project context across every AI tool you use.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Projects</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          A <strong className="text-[var(--relay-ink)]">project</strong> is the top-level container in Relay. Each project has its own context,
          memory, packets, and work sessions. Think of it as one codebase, one initiative, or one product.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">What is Project context?</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          <strong className="text-[var(--relay-ink)]">Project Context</strong> is your project&apos;s stable truth — the facts Relay is confident
          about and uses to generate briefs. Context entries are grouped by kind:
        </p>
        <div className="divide-y divide-[var(--relay-line)] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
          {[
            { kind: "objective", desc: "What the project is trying to achieve right now." },
            { kind: "decision", desc: "A choice that was made and should be respected." },
            { kind: "constraint", desc: "A rule or limitation that must hold." },
            { kind: "task", desc: "An open work item." },
            { kind: "progress", desc: "Recent accomplishments or milestones." },
            { kind: "architecture_fact", desc: "Structural knowledge about the codebase." },
            { kind: "risk", desc: "Known risks or potential issues." },
            { kind: "assumption", desc: "Something taken as true without proof." },
          ].map((item) => (
            <div key={item.kind} className="px-4 py-3">
              <code className="text-[13px] font-mono font-medium text-[var(--relay-ink)]">{item.kind}</code>
              <p className="mt-0.5 text-[13px] text-[var(--relay-muted)]">{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Each entry has a status: <strong className="text-[var(--relay-ink)]">active</strong> (confirmed),{" "}
          <strong className="text-[var(--relay-ink)]">tentative</strong> (low confidence, pending review),{" "}
          <strong className="text-[var(--relay-ink)]">disputed</strong> (conflicting evidence),{" "}
          <strong className="text-[var(--relay-ink)]">superseded</strong> (replaced by a newer entry),{" "}
          <strong className="text-[var(--relay-ink)]">stale</strong> (no recent reaffirmation), or{" "}
          <strong className="text-[var(--relay-ink)]">resolved</strong> (completed/closed).
        </p>
        <p className="text-[15px] text-[var(--relay-muted)]">
          You can lock any entry to prevent Relay from modifying it automatically.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">How Relay decides what is true</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Relay builds context through an <strong className="text-[var(--relay-ink)]">observe → reflect → promote</strong> cycle:
        </p>
        <ol className="list-decimal list-inside space-y-1.5 text-[15px] text-[var(--relay-muted)]">
          <li><strong className="text-[var(--relay-ink)]">Observe</strong> — Each session digest is analyzed for facts that might be context-worthy.</li>
          <li><strong className="text-[var(--relay-ink)]">Reflect</strong> — Observed facts are compared against existing context for conflicts or confirmation.</li>
          <li><strong className="text-[var(--relay-ink)]">Promote or conflict</strong> — Strong evidence promotes tentative entries to active; contradictions flag disputes.</li>
        </ol>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Confidence scores, evidence count, and reaffirmation frequency determine promotion speed.
          On aggressive autonomy, Relay promotes eagerly. On conservative, everything stays tentative until you lock it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Current vs historical truth</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Context entries have optional <code className="text-[var(--relay-ink)]">validFrom</code> and{" "}
          <code className="text-[var(--relay-ink)]">validUntil</code> timestamps. Active entries represent current truth;
          superseded entries represent what was true before.
        </p>
        <p className="text-[15px] text-[var(--relay-muted)]">
          When you ask Relay &ldquo;what was the objective last week?&rdquo;, temporal retrieval checks historical context
          and superseded entries. Current queries use active context only.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Why memory may be demoted or archived</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Raw memory items go through <strong className="text-[var(--relay-ink)]">compaction</strong>. When a fact graduates
          into context or gets absorbed by a summary snapshot, the original memory item is demoted to save retrieval budget.
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-[15px] text-[var(--relay-muted)]">
          <li><strong className="text-[var(--relay-ink)]">covered_by_context</strong> — The fact is now a context entry.</li>
          <li><strong className="text-[var(--relay-ink)]">covered_by_summary</strong> — A project summary covers the same ground.</li>
          <li><strong className="text-[var(--relay-ink)]">historical_only</strong> — Retained for provenance, not included in active retrieval.</li>
          <li><strong className="text-[var(--relay-ink)]">completed</strong> — Task or note is done.</li>
        </ul>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Demoted items are never deleted — they remain available for historical queries and provenance tracking.
          Compaction aggressiveness is controlled in project settings (light / standard / aggressive).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Browser packets vs agent packets</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Context packets are the formatted output Relay injects into your AI tools. There are two families:
        </p>
        <div className="divide-y divide-[var(--relay-line)] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
          {[
            { mode: "Fresh chat bootstrap", desc: "Full project context for a new browser chat session. Includes context, recent memory, and project state." },
            { mode: "Quick continuity", desc: "Delta packet for continuing an existing browser session. Only what changed since last sync." },
            { mode: "Agent full bootstrap", desc: "Deep context for MCP-connected agents (Claude Code, Cursor, etc.). Richer format with architecture facts and tool references." },
            { mode: "Agent quick continuity", desc: "Lightweight delta for agents mid-session. Minimal token cost." },
          ].map((item) => (
            <div key={item.mode} className="px-4 py-3">
              <p className="text-[13px] font-medium text-[var(--relay-ink)]">{item.mode}</p>
              <p className="mt-0.5 text-[13px] text-[var(--relay-muted)]">{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Packets are target-aware: the same context produces different output for Claude Code vs. ChatGPT
          based on token budgets and formatting conventions.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Memory items</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Memory items are the raw captured context from your sessions. Each has a type:
        </p>
        <div className="divide-y divide-[var(--relay-line)] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
          {[
            { type: "decision", desc: "A choice that was made and should be remembered." },
            { type: "task", desc: "Something to be done or tracked." },
            { type: "constraint", desc: "A rule or limitation." },
            { type: "note", desc: "General context or observations." },
            { type: "requirement", desc: "A user or product requirement." },
            { type: "artifact", desc: "A reference to a file, URL, or resource." },
          ].map((item) => (
            <div key={item.type} className="px-4 py-3">
              <code className="text-[13px] font-mono font-medium text-[var(--relay-ink)]">{item.type}</code>
              <p className="mt-0.5 text-[13px] text-[var(--relay-muted)]">{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Items are scored by decay (freshness + reaffirmation) and can be pinned for priority inclusion in packets.
          Strong memory items graduate into context entries over time.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Drift reconciliation</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          When you work across multiple AI tools simultaneously, each surface may produce different claims about
          the same topic. Relay&apos;s <strong className="text-[var(--relay-ink)]">drift reconciler</strong> detects when
          facts from different surfaces contradict each other and flags them as disputes.
        </p>
        <p className="text-[15px] text-[var(--relay-muted)]">
          By default, the most recent surface &ldquo;wins&rdquo; for active status, but both perspectives are retained
          for review.
        </p>
      </section>

      <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-soft)] px-5 py-4">
        <p className="text-[14px] font-medium text-[var(--relay-ink)]">Need pricing details?</p>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          See <Link href="/docs/plans" className="text-[var(--relay-accent)] underline underline-offset-2">Plans &amp; limits</Link> for the full Free / Starter / Pro comparison.
        </p>
      </div>

      <Suspense fallback={null}>
        <DocsFooterNav previous={{ href: "/docs/api", label: "API Reference" }} />
      </Suspense>
    </div>
  )
}
