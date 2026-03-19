import Link from "next/link"
import { Suspense } from "react"

import { DocsFooterNav } from "@/components/docs/docs-footer-nav"

export default function GettingStartedPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--relay-ink)]">Getting Started</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
          Get up and running with Relay in under five minutes.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">1. Create an account</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Head to{" "}
          <Link href="/get-started" className="text-[var(--relay-accent)] underline underline-offset-2">
            onrelay.app/get-started
          </Link>{" "}
          and sign up with Google or a magic link. No credit card required for the free plan.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">2. Create your first project</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          After signing in, you&apos;ll be prompted to create your first project. Give it a name that matches
          your codebase or initiative — Relay organizes all context per-project.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">3. Install the Chrome extension</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          The Relay extension watches your AI chats and automatically captures decisions, tasks, and context.
          Install it from the Chrome Web Store (coming soon) or load the dev build from{" "}
          <code className="text-[13px] font-mono text-[var(--relay-ink)]">apps/extension</code>.
        </p>
        <p className="text-[15px] text-[var(--relay-muted)]">
          After installing, open the Relay side panel in Chrome and sign in directly inside the extension sidebar.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">4. Connect MCP (optional)</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          If you use Claude Code, Cursor, Windsurf, or another MCP-compatible tool, connect Relay via MCP
          for full two-way sync. See the{" "}
          <Link href="/docs/mcp" className="text-[var(--relay-accent)] underline underline-offset-2">
            MCP Integration
          </Link>{" "}
          guide.
        </p>
        <pre className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-3 text-[13px] font-mono text-[var(--relay-ink)]">
          npx @relay/cli
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">5. Start chatting</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Open ChatGPT, Claude, or any supported AI tool. The extension captures context automatically.
          When you start a new chat or coding session, Relay provides your project brief so the AI
          has full context from the start.
        </p>
      </section>

      <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-soft)] px-5 py-4">
        <p className="text-[14px] font-medium text-[var(--relay-ink)]">What&apos;s next?</p>
        <ul className="mt-2 space-y-1 text-[13px] text-[var(--relay-muted)]">
          <li>
            <Link href="/docs/extension" className="text-[var(--relay-accent)] underline underline-offset-2">
              Chrome Extension guide
            </Link>{" "}
            — supported platforms, settings, capture behavior
          </li>
          <li>
            <Link href="/docs/mcp" className="text-[var(--relay-accent)] underline underline-offset-2">
              MCP Integration
            </Link>{" "}
            — IDE setup, available tools
          </li>
          <li>
            <Link href="/docs/concepts" className="text-[var(--relay-accent)] underline underline-offset-2">
              Concepts
            </Link>{" "}
            — how Relay organizes and scores context
          </li>
          <li>
            <Link href="/docs/plans" className="text-[var(--relay-accent)] underline underline-offset-2">
              Plans & limits
            </Link>{" "}
            — compare Free and Pro before upgrading
          </li>
        </ul>
      </div>

      <Suspense fallback={null}>
        <DocsFooterNav next={{ href: "/docs/mcp", label: "MCP Integration" }} />
      </Suspense>
    </div>
  )
}
