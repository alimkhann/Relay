import Image from "next/image"
import Link from "next/link"
import { ArrowRight, CornerDownRight, Sparkles, Wand2 } from "lucide-react"

import { Button } from "@/components/ui/button"

const valueCards = [
  {
    title: "Capture the useful parts",
    copy: "Relay saves visible turns from ChatGPT, Claude, and Perplexity without asking you to rewrite what just happened."
  },
  {
    title: "Pin what should survive",
    copy: "Turn a line into a decision, constraint, task, or note before the thread disappears behind another tab."
  },
  {
    title: "Drop context into the next tool",
    copy: "Open another AI, fetch the right packet, and insert it in one click without auto-submitting."
  }
]

export default function MarketingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f1f4ec] text-[var(--relay-ink)]">
      <section className="relative min-h-screen">
        <div className="absolute inset-0">
          <Image
            src="/images/hero-hills.jpg"
            alt="Misty green hills behind the Relay landing hero"
            fill
            priority
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(242,245,238,0.82),rgba(242,245,238,0.42)_34%,rgba(17,24,17,0.22)_70%,rgba(12,17,12,0.58))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),transparent_28%)]" />
        </div>

        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 lg:px-8 lg:py-8">
          <header className="flex flex-wrap items-center justify-between gap-4 rounded-full border border-white/50 bg-white/55 px-5 py-4 shadow-[var(--relay-shadow)] backdrop-blur-xl">
            <Link href="/" className="inline-flex items-center rounded-full bg-[var(--relay-accent)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-white">
              Relay
            </Link>
            <nav className="hidden items-center gap-2 rounded-full border border-white/60 bg-white/55 px-2 py-2 text-sm text-[var(--relay-muted)] md:flex">
              <a className="rounded-full px-3 py-2 transition hover:bg-white/90 hover:text-[var(--relay-ink)]" href="#why">
                Why it feels better
              </a>
              <a className="rounded-full px-3 py-2 transition hover:bg-white/90 hover:text-[var(--relay-ink)]" href="#product">
                Product view
              </a>
            </nav>
            <div className="flex items-center gap-3">
              <Link className="rounded-full border border-white/60 bg-white/60 px-4 py-2 text-sm font-medium text-[var(--relay-muted)] transition hover:bg-white" href="/sign-in">
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

          <div className="flex flex-1 items-center">
            <div className="grid w-full gap-10 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <div className="max-w-3xl space-y-8">
                <div className="inline-flex rounded-full border border-white/60 bg-white/58 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--relay-muted)] backdrop-blur">
                  Cross-AI project memory
                </div>
                <div className="space-y-5">
                  <h1 className="max-w-4xl text-5xl font-semibold leading-[0.92] tracking-[-0.04em] text-[#102013] md:text-7xl">
                    Stop re-briefing the next AI.
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-[#203124]/84 md:text-xl">
                    Relay quietly keeps the thread of your project alive while you move between ChatGPT, Claude, and Perplexity.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <Button asChild>
                    <Link href="/dashboard">See your project view</Link>
                  </Button>
                  <Link
                    href="/settings"
                    className="inline-flex items-center rounded-full border border-white/60 bg-white/58 px-5 py-3 text-sm font-semibold text-[var(--relay-ink)] backdrop-blur transition hover:bg-white">
                    Connect the extension
                  </Link>
                </div>
                <div className="flex flex-wrap gap-3">
                  {["ChatGPT", "Claude", "Perplexity", "Pinned decisions", "One-click insert"].map((item) => (
                    <span key={item} className="rounded-full border border-white/55 bg-white/48 px-4 py-2 text-sm text-[var(--relay-muted)] backdrop-blur">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-[32px] border border-white/55 bg-[rgba(249,251,246,0.72)] p-6 shadow-[var(--relay-shadow)] backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Current project</p>
                      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">Relay MVP</h2>
                    </div>
                    <div className="rounded-full bg-[var(--relay-accent)] px-4 py-2 text-sm font-semibold text-white">Bound</div>
                  </div>
                  <div className="mt-6 grid gap-3">
                    <div className="rounded-[24px] bg-[#182718] p-5 text-white">
                      <p className="text-xs uppercase tracking-[0.28em] text-white/65">Pinned constraint</p>
                      <p className="mt-3 text-sm leading-6 text-white/86">Keep the MVP browser-first, cheap to host, and easy to review.</p>
                    </div>
                    <div className="rounded-[24px] border border-[var(--relay-line)] bg-white/80 p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-[var(--relay-muted)]">Ready for the next tool</p>
                      <p className="mt-3 text-sm leading-6 text-[var(--relay-muted)]">Compose a clean context packet and insert it without sending the prompt.</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[32px] border border-white/55 bg-[rgba(249,251,246,0.58)] p-6 shadow-[var(--relay-shadow)] backdrop-blur-xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">The handoff loop</p>
                  <div className="mt-4 space-y-3">
                    {[
                      "Capture visible turns",
                      "Pin the decision or task",
                      "Insert context into the next AI"
                    ].map((item) => (
                      <div key={item} className="flex items-center justify-between rounded-[20px] border border-[var(--relay-line)] bg-white/70 px-4 py-3">
                        <span className="text-sm font-medium text-[var(--relay-ink)]">{item}</span>
                        <CornerDownRight className="h-4 w-4 text-[var(--relay-muted)]" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="why" className="relative z-10 -mt-24 px-5 pb-24 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
          {valueCards.map((card, index) => (
            <div
              key={card.title}
              className={`rounded-[30px] border p-6 shadow-[var(--relay-shadow)] backdrop-blur ${
                index === 0
                  ? "border-[#d8e2cf] bg-[#f7faf4]"
                  : index === 1
                    ? "border-[#d8ddcf] bg-[#fbfbf8]"
                    : "border-[#cfdac8] bg-[#eef5ea]"
              }`}>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">
                {index + 1 < 10 ? `0${index + 1}` : index + 1}
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">{card.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">{card.copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="product" className="px-5 pb-28 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-5">
            <div className="inline-flex rounded-full border border-[var(--relay-line)] bg-white/72 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">
              What the user actually sees
            </div>
            <h2 className="max-w-xl text-4xl font-semibold tracking-[-0.03em] text-[var(--relay-ink)] md:text-5xl">
              A calm project view, not another wall of setup text.
            </h2>
            <p className="max-w-xl text-base leading-8 text-[var(--relay-muted)]">
              The dashboard keeps recent captures, pinned memory, and the latest handoff packet close together so the next move is obvious.
            </p>
            <div className="grid gap-3">
              {[
                "Recent captures show exactly what was saved from each tool.",
                "Pinned memory stays visible so constraints do not get lost.",
                "Extension tokens live in settings so Chrome can connect once and stay out of the way."
              ].map((line) => (
                <div key={line} className="flex items-start gap-3 rounded-[22px] border border-[var(--relay-line)] bg-white/72 px-4 py-4">
                  <Sparkles className="mt-0.5 h-4 w-4 text-[var(--relay-accent)]" />
                  <p className="text-sm leading-6 text-[var(--relay-muted)]">{line}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[34px] border border-[var(--relay-line)] bg-white/84 p-5 shadow-[var(--relay-shadow)] backdrop-blur">
            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[28px] bg-[#eef5ea] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Dashboard snapshot</p>
                <div className="mt-5 space-y-3">
                  {[
                    ["Current project", "Relay MVP"],
                    ["Visible captures", "3 sessions this week"],
                    ["Pinned memory", "5 decisions and constraints"],
                    ["Next action", "Insert a Claude Code handoff"]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[22px] bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-[var(--relay-muted)]">{label}</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--relay-ink)]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-[28px] border border-[var(--relay-line)] bg-[#193021] p-5 text-white">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/70">Latest packet</p>
                  <p className="mt-3 text-sm leading-7 text-white/84">
                    Current goal, important decisions, open tasks, and the context worth carrying forward.
                  </p>
                </div>
                <div className="rounded-[28px] border border-[var(--relay-line)] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--relay-muted)]">Extension</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
                    Paste the one-time token, pick a project, and keep the popup lean.
                  </p>
                </div>
                <div className="rounded-[28px] border border-[var(--relay-line)] bg-[#f7faf4] p-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--relay-muted)]">Not in scope</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
                    No vector database, no auto-submission, no heavyweight team layer in the MVP.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/sign-in">Sign in to start</Link>
              </Button>
              <Link
                href="/settings"
                className="inline-flex items-center rounded-full border border-[var(--relay-line)] bg-white px-5 py-3 text-sm font-semibold text-[var(--relay-ink)] transition hover:bg-[var(--relay-soft)]">
                Open extension setup
                <Wand2 className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
