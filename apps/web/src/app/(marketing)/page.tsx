import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"

const pillars = [
  {
    title: "Capture the useful moments",
    copy: "Relay watches supported AI chats and saves the parts worth carrying forward."
  },
  {
    title: "Keep one project brief alive",
    copy: "Recent chats turn into saved decisions, constraints, progress, and next steps."
  },
  {
    title: "Start the next chat without re-briefing",
    copy: "Open a fresh chat and insert a ready project brief in one click."
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
                Project brief for fresh chats
              </div>
              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-semibold leading-[0.92] tracking-[-0.06em] md:text-7xl">
                  Stop rebuilding your project every time the chat resets.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-[var(--relay-muted)]">
                  Relay saves what matters from your AI work and inserts a clean project brief into the next fresh chat.
                </p>
                <p className="max-w-2xl text-sm font-medium uppercase tracking-[0.2em] text-[var(--relay-muted)]">
                  Works best for coding projects. Also useful for research and planning.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/dashboard">Open Relay</Link>
                </Button>
                <Button asChild variant="secondary">
                  <a href="#workflow">See how it works</a>
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
                    <p className="mt-3 text-sm leading-7 text-white/76">Ready for this chat</p>
                    <div className="mt-5 grid gap-3">
                      <div className="rounded-[14px] bg-white/8 px-4 py-3 text-sm">Insert project brief</div>
                      <div className="rounded-[14px] border border-white/10 px-4 py-3 text-sm text-white/78">Save to project</div>
                    </div>
                    <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/52">Built from recent chats and saved project context</p>
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
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">A calmer loop than transcript copy and another round of re-explaining.</h2>
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
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Project context first. Dashboard second.</p>
            <h2 className="text-4xl font-semibold tracking-[-0.04em]">Project context first. Dashboard second.</h2>
            <p className="max-w-xl text-base leading-8 text-[var(--relay-muted)]">
              The sidepanel does the daily work. The web app stays calm and review-focused: saved context, recent chats, and the latest project brief.
            </p>
            <p className="max-w-xl text-sm font-medium uppercase tracking-[0.2em] text-[var(--relay-muted)]">Best for long-running coding work where fresh chats happen often.</p>
          </div>

          <div className="rounded-[22px] border border-[var(--relay-line)] bg-white/82 p-5 shadow-[var(--relay-shadow)]">
            <div className="grid gap-4 lg:grid-cols-[0.98fr_1.02fr]">
              <div className="rounded-[18px] bg-[var(--relay-soft)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Saved project context</p>
                <div className="mt-4 space-y-3">
                  {[
                    ["Overview", "Long-running coding work that moves across fresh chats."],
                    ["Current objective", "Ship the quiet assistant rewrite and inline insert flow."],
                    ["Open task", "Make fresh-chat insertion feel immediate."]
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
                  <p className="text-xs uppercase tracking-[0.26em] text-white/56">Latest project brief</p>
                  <p className="mt-3 text-sm leading-7 text-white/78">
                    A clean fresh-chat brief with context, current objective, constraints, open tasks, and the next move.
                  </p>
                </div>
                <div className="rounded-[18px] border border-[var(--relay-line)] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.26em] text-[var(--relay-muted)]">Inline insert</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
                    Fresh chat detected. One click inserts the project brief. The sidepanel is there when you need it, not before.
                  </p>
                </div>
                <div className="rounded-[18px] border border-[var(--relay-line)] bg-[var(--relay-soft)] p-5">
                  <p className="text-xs uppercase tracking-[0.26em] text-[var(--relay-muted)]">Fallback</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
                    If AI is unavailable, Relay still inserts a bounded brief from saved project context instead of breaking the flow.
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
