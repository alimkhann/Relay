import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"

const pillars = [
  {
    title: "Capture the meaningful moments",
    copy: "Relay watches supported AI chats, stores the source material, and avoids bloating the next prompt with transcript paste."
  },
  {
    title: "Keep one project state alive",
    copy: "Session digests merge into a durable project state with decisions, constraints, progress, tools, and open tasks."
  },
  {
    title: "Restore the next fresh chat",
    copy: "Open a new chat, tap one control, and Relay inserts a bounded bootstrap instead of making you re-brief the whole project."
  }
]

export default function MarketingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--relay-app-bg)] text-[var(--relay-ink)]">
      <section className="px-5 pt-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-7xl rounded-[24px] border border-[var(--relay-line)] bg-white/58 p-4 shadow-[var(--relay-shadow)] backdrop-blur">
          <header className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-white/70 bg-white/68 px-4 py-4">
            <Link href="/" className="inline-flex items-center rounded-[10px] bg-[var(--relay-accent)] px-3 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-white">
              Relay
            </Link>
            <nav className="flex items-center gap-2 text-sm text-[var(--relay-muted)]">
              <a className="rounded-[10px] px-3 py-2 transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]" href="#product">
                Product
              </a>
              <a className="rounded-[10px] px-3 py-2 transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]" href="#workflow">
                Workflow
              </a>
            </nav>
            <div className="flex items-center gap-3">
              <Link className="rounded-[12px] border border-[var(--relay-line)] bg-white/80 px-4 py-2 text-sm font-medium text-[var(--relay-muted)] transition hover:bg-white" href="/sign-in">
                Sign in
              </Link>
              <Button asChild>
                <Link href="/dashboard">
                  Open Relay
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </header>

          <div className="grid gap-8 px-2 pb-2 pt-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-end">
            <div className="space-y-8 px-4 pb-8 lg:px-8 lg:pb-10">
              <div className="inline-flex rounded-[999px] border border-[var(--relay-line)] bg-white/72 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">
                Fresh-chat bootstrap for AI work
              </div>
              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-semibold leading-[0.92] tracking-[-0.06em] md:text-7xl">
                  Stop rebuilding your project every time the chat resets.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-[var(--relay-muted)]">
                  Relay captures what matters, keeps project state alive, and restores the next ChatGPT, Claude, Codex, or Perplexity session with one clean bootstrap.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/dashboard">View the dashboard</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/settings">See setup</Link>
                </Button>
              </div>
            </div>

            <div className="relative min-h-[560px] overflow-hidden rounded-[22px] border border-white/60 bg-[#d8d7d0]">
              <Image
                src="/images/hero-hills.jpg"
                alt="Misty hills behind the Relay product preview"
                fill
                priority
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(247,245,238,0.88),rgba(247,245,238,0.18)_42%,rgba(20,22,18,0.36))]" />
              <div className="absolute inset-0 p-6">
                <div className="mx-auto max-w-[420px] rounded-[22px] border border-white/65 bg-[rgba(247,245,238,0.62)] p-5 shadow-[var(--relay-shadow)] backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Sidepanel preview</p>
                  <div className="mt-5 rounded-[18px] border border-[var(--relay-line)] bg-[#161916] p-5 text-white">
                    <p className="text-xs uppercase tracking-[0.26em] text-white/58">Current project</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">Relay</h2>
                    <p className="mt-3 text-sm leading-7 text-white/76">Fresh chat detected. Relay can insert a full bootstrap for the next coding session.</p>
                    <div className="mt-5 grid gap-3">
                      <div className="rounded-[14px] bg-white/8 px-4 py-3 text-sm">Insert bootstrap</div>
                      <div className="rounded-[14px] border border-white/10 px-4 py-3 text-sm text-white/78">Pin selection</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="px-5 py-24 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">How it works</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">A calmer loop than transcript copy and token juggling.</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {pillars.map((pillar) => (
              <div key={pillar.title} className="rounded-[20px] border border-[var(--relay-line)] bg-white/78 p-6 shadow-[var(--relay-shadow)]">
                <p className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">{pillar.title}</p>
                <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">{pillar.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="product" className="px-5 pb-28 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">What Relay keeps nearby</p>
            <h2 className="text-4xl font-semibold tracking-[-0.04em]">Project state first. Dashboard second.</h2>
            <p className="max-w-xl text-base leading-8 text-[var(--relay-muted)]">
              The sidepanel does the daily work. The web app stays calm and review-oriented: project overview, digests, open tasks, and the latest bootstrap packet.
            </p>
          </div>

          <div className="rounded-[22px] border border-[var(--relay-line)] bg-white/82 p-5 shadow-[var(--relay-shadow)]">
            <div className="grid gap-4 lg:grid-cols-[0.98fr_1.02fr]">
              <div className="rounded-[18px] bg-[var(--relay-soft)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Project state</p>
                <div className="mt-4 space-y-3">
                  {[
                    ["Overview", "Cross-vendor continuity for long-running AI work."],
                    ["Objective", "Insert a bounded bootstrap into the next fresh chat."],
                    ["Open task", "Finish extension pairing and launch the redesign pass."]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[14px] bg-white/84 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--relay-muted)]">{label}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--relay-ink)]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-[18px] border border-[var(--relay-line)] bg-[#171915] p-5 text-white">
                  <p className="text-xs uppercase tracking-[0.26em] text-white/56">Latest bootstrap</p>
                  <p className="mt-3 text-sm leading-7 text-white/78">
                    A structured handoff with overview, current objective, constraints, open tasks, relevant tools, and the next action.
                  </p>
                </div>
                <div className="rounded-[18px] border border-[var(--relay-line)] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.26em] text-[var(--relay-muted)]">Connection</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
                    Pair the extension once from the sidepanel. No raw token paste in the normal setup path.
                  </p>
                </div>
                <div className="rounded-[18px] border border-[var(--relay-line)] bg-[var(--relay-soft)] p-5">
                  <p className="text-xs uppercase tracking-[0.26em] text-[var(--relay-muted)]">Guardrails</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
                    Count tokens before Gemini calls, route 3.x first, fall back to 2.5 only when rate limits are hit, and degrade gracefully when AI is unavailable.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
