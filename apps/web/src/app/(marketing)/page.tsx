import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { LandingHeader } from "./landing-header"
import { LandingAnimations } from "./landing-animations"
import { FAQ } from "./faq"

const steps = [
  {
    num: "01",
    title: "Relay saves useful parts of your AI chats automatically",
    copy: "Work in ChatGPT, Claude, Codex, or Perplexity. Relay quietly captures what matters — decisions, tasks, constraints."
  },
  {
    num: "02",
    title: "Decisions, progress, and next steps carry forward",
    copy: "Your project brief updates itself as you work across sessions and tools."
  },
  {
    num: "03",
    title: "One click starts the next chat with full context",
    copy: "Open a fresh chat. Insert your project brief. Keep building where you left off."
  }
]

const platforms = ["ChatGPT", "Claude", "Codex", "Perplexity"]

export default function MarketingPage() {
  return (
    <LandingAnimations>
      <main className="min-h-screen">
        <LandingHeader />

        {/* ─── Full-bleed Hero ─── */}
        <section className="relative min-h-screen overflow-hidden">
          {/* Background image */}
          <Image
            src="/images/hero_bg.png"
            alt=""
            fill
            priority
            className="object-cover object-top"
            sizes="100vw"
          />
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-transparent" />
          {/* Bottom gradient: fades image → white */}
          <div className="absolute bottom-0 left-0 right-0 h-[35vh] bg-gradient-to-b from-transparent via-white/70 to-white" />

          {/* Hero content — centered */}
          <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
            <div className="max-w-3xl" data-animate="hero">
              <h1 className="text-5xl font-bold leading-[1.02] tracking-[-0.035em] text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.15)] md:text-7xl lg:text-[5.5rem]">
                Relay your context
                <br className="hidden md:block" />
                {" "}between AIs.
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/80 md:text-xl">
                Relay saves what matters from your AI work and inserts a clean project brief into the next fresh chat.
              </p>
              <div className="mt-10">
                <Link
                  href="/dashboard"
                  className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-[#111210] shadow-[0_2px_16px_rgba(0,0,0,0.12)] transition-all duration-300 hover:shadow-[0_6px_24px_rgba(0,0,0,0.2)] hover:-translate-y-0.5"
                >
                  Get started
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>

            {/* Platform bar near bottom */}
            <div className="absolute bottom-14 left-0 right-0 flex flex-col items-center gap-3" data-animate="platforms">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">Works with</p>
              <div className="flex items-center gap-8">
                {platforms.map((p) => (
                  <span key={p} className="text-sm font-semibold tracking-wide text-white/55">{p}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════ Below-fold: Light theme ═══════ */}

        {/* ─── How it works ─── */}
        <section id="how-it-works" className="bg-white px-6 py-24 lg:px-10 lg:py-32">
          <div className="mx-auto max-w-4xl">
            <div className="mb-16 max-w-2xl" data-animate="section">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">How it works</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
                A calmer loop than copy-pasting transcripts.
              </h2>
            </div>
            <div className="space-y-1">
              {steps.map((step) => (
                <div key={step.num} className="group flex gap-6 border-b border-gray-100 py-8 first:border-t md:gap-10" data-animate="step">
                  <span className="mt-1 text-sm font-bold tabular-nums text-gray-300">{step.num}</span>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold tracking-tight text-gray-900 md:text-xl">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">{step.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <FAQ />

        {/* ─── Footer ─── */}
        <footer className="border-t border-gray-100 bg-white px-6 py-10 lg:px-10">
          <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-3">
              <Image
                src="/images/relay_logo_white.png"
                alt="Relay"
                width={20}
                height={20}
                className="brightness-0 opacity-40"
              />
              <p className="text-sm text-gray-400">
                Keep your project brief ready for every fresh AI chat.
              </p>
            </div>
            <div className="flex items-center gap-5 text-[13px] text-gray-400">
              <Link href="/terms" className="transition hover:text-gray-600">Terms</Link>
              <Link href="/privacy" className="transition hover:text-gray-600">Privacy</Link>
              <Link href="/dashboard" className="transition hover:text-gray-600">Dashboard</Link>
            </div>
          </div>
        </footer>
      </main>
    </LandingAnimations>
  )
}
