import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LandingAnimations } from "./landing-animations"

const steps = [
  {
    num: "01",
    title: "Relay saves useful parts of your AI chats automatically",
    copy: "Work in ChatGPT, Claude, Codex, or Perplexity. Relay quietly captures what matters."
  },
  {
    num: "02",
    title: "Decisions, progress, and next steps carry forward",
    copy: "Your project brief updates itself as you work across sessions."
  },
  {
    num: "03",
    title: "One click starts the next chat with full context",
    copy: "Open a fresh chat. Insert your project brief. Keep building."
  }
]

const platforms = ["ChatGPT", "Claude", "Codex", "Perplexity"]

export default function MarketingPage() {
  return (
    <LandingAnimations>
      <main className="min-h-screen bg-[var(--relay-bg)] text-[var(--relay-ink)]">
        {/* ─── Full-bleed Hero ─── */}
        <section className="relative min-h-screen overflow-hidden">
          {/* Background image */}
          <Image
            src="/images/hero-hills.jpg"
            alt=""
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-[var(--relay-hero-overlay)]" />

          {/* Transparent nav */}
          <header className="relative z-20 flex items-center justify-between px-6 py-5 lg:px-10 lg:py-6" data-animate="nav">
            <Link href="/" className="text-[15px] font-bold tracking-tight text-white">
              Relay
            </Link>
            <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
              <a className="transition hover:text-white" href="#how-it-works">How it works</a>
              <a className="transition hover:text-white" href="#product">Product</a>
            </nav>
            <div className="flex items-center gap-3">
              <Link className="hidden text-sm font-medium text-white/70 transition hover:text-white sm:inline" href="/sign-in">
                Sign in
              </Link>
              <Button asChild className="bg-white text-[#111210] hover:bg-white/90 shadow-none">
                <Link href="/dashboard">
                  Get started
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </header>

          {/* Hero content — centered */}
          <div className="relative z-10 flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-6 text-center">
            <div className="max-w-3xl" data-animate="hero">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                For coding workflows
              </p>
              <h1 className="text-5xl font-bold leading-[1.02] tracking-[-0.035em] text-white md:text-7xl lg:text-8xl">
                Discover hidden paths
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/75 md:text-xl">
                Relay saves what matters from your AI work and inserts a clean project brief into the next fresh chat.
              </p>
              <p className="mt-4 text-sm font-medium text-white/45">
                Works best for coding projects. Also useful for research and planning.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild className="bg-white text-[#111210] hover:bg-white/90 shadow-none px-6 py-3">
                  <Link href="/dashboard">Start Exploring</Link>
                </Button>
                <Button asChild variant="secondary" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  <a href="#how-it-works">View Adventures</a>
                </Button>
              </div>
            </div>

            {/* Platform bar at bottom of hero */}
            <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3" data-animate="platforms">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">Our sponsors</p>
              <div className="flex items-center gap-8">
                {platforms.map((p) => (
                  <span key={p} className="text-sm font-semibold tracking-wide text-white/50">{p}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── How it works ─── */}
        <section id="how-it-works" className="px-6 py-24 lg:px-10 lg:py-32">
          <div className="mx-auto max-w-4xl">
            <div className="mb-16 max-w-2xl" data-animate="section">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--relay-muted)]">How it works</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                A calmer loop than copy-pasting transcripts.
              </h2>
            </div>
            <div className="space-y-1">
              {steps.map((step) => (
                <div key={step.num} className="group flex gap-6 border-b border-[var(--relay-line)] py-8 first:border-t md:gap-10" data-animate="step">
                  <span className="mt-1 text-sm font-bold tabular-nums text-[var(--relay-faint)]">{step.num}</span>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold tracking-tight md:text-xl">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--relay-muted)]">{step.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Product preview ─── */}
        <section id="product" className="px-6 pb-32 lg:px-10">
          <div className="mx-auto max-w-4xl">
            <div className="mb-12" data-animate="section">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--relay-muted)]">Product</p>
              <h2 className="mt-3 max-w-md text-3xl font-bold tracking-tight md:text-4xl">
                The extension does the work. The dashboard stays out of the way.
              </h2>
            </div>

            {/* Sidepanel mockup */}
            <div className="mx-auto max-w-sm" data-animate="mockup">
              <div className="rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6 shadow-[var(--relay-shadow-lg)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--relay-muted)]">Sidepanel</p>
                <div className="mt-5 rounded-[var(--relay-radius)] bg-[var(--relay-accent)] p-5 text-[var(--relay-accent-text)]">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] opacity-50">Current project</p>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight">Relay</h3>
                  <p className="mt-2 text-sm opacity-60">Ready for this chat</p>
                  <div className="mt-5 space-y-2.5">
                    <div className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent-text)]/10 px-4 py-2.5 text-sm font-medium">
                      Insert project brief
                    </div>
                    <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-accent-text)]/10 px-4 py-2.5 text-sm opacity-70">
                      Save to project
                    </div>
                  </div>
                  <p className="mt-4 text-[11px] opacity-35">5 chats · 12 saved items</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Footer ─── */}
        <footer className="border-t border-[var(--relay-line)] px-6 py-10 lg:px-10">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <div>
              <p className="text-sm font-bold tracking-tight">Relay</p>
              <p className="mt-1 text-xs text-[var(--relay-muted)]">Built for long-running coding work.</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Open Dashboard</Link>
            </Button>
          </div>
        </footer>
      </main>
    </LandingAnimations>
  )
}
