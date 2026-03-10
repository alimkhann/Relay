import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ChevronRight, Layers3, Link2, MousePointerClick, PanelRightOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SectionHeading } from "@/components/layout/section-heading"

const steps = [
  {
    title: "Capture quietly",
    description: "Relay reads supported tabs, extracts visible turns, and stores clean session captures per project.",
    icon: Layers3
  },
  {
    title: "Pin the signal",
    description: "One click turns a useful snippet into a reusable decision, constraint, task, or note.",
    icon: MousePointerClick
  },
  {
    title: "Drop context anywhere",
    description: "Open another AI tool, fetch the right packet, and insert context without re-explaining the project.",
    icon: Link2
  }
]

export default function MarketingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f1e7] text-stone-900">
      <section className="relative isolate">
        <div className="absolute inset-x-0 top-0 -z-10 h-[46rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),transparent_48%)]" />
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:py-10">
          <div className="flex flex-col gap-10">
            <header className="flex items-center justify-between rounded-full border border-stone-900/10 bg-white/65 px-5 py-4 backdrop-blur">
              <Link href="/" className="text-sm font-semibold tracking-[0.24em] uppercase">
                Relay
              </Link>
              <nav className="hidden gap-6 text-sm text-stone-600 md:flex">
                <a href="#workflow">Workflow</a>
                <a href="#architecture">Architecture</a>
                <a href="#mvp">MVP</a>
              </nav>
            </header>

            <div className="space-y-7">
              <div className="inline-flex rounded-full border border-stone-900/10 bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-stone-600 backdrop-blur">
                Browser-first project memory
              </div>
              <div className="max-w-3xl space-y-5">
                <h1 className="font-serif text-5xl leading-[0.95] tracking-tight text-stone-950 md:text-7xl">
                  Keep the project in motion while the tools change around it.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-stone-700 md:text-xl">
                  Relay sits between ChatGPT, Claude, and Perplexity, captures just enough context, and makes handoff feel
                  like a single gesture instead of a repeated briefing.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Button asChild>
                  <Link href="/dashboard">
                    Open dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/sign-in">Configure auth</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["Supported tools", "ChatGPT, Claude, Perplexity"],
                ["Core loop", "Capture, pin, compose, insert"],
                ["Storage model", "Supabase with demo fallback"]
              ].map(([label, value]) => (
                <Card key={label} className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">{label}</p>
                  <p className="mt-4 text-lg font-semibold text-stone-900">{value}</p>
                </Card>
              ))}
            </div>
          </div>

          <div className="relative">
            <Card className="overflow-hidden bg-white/35 p-4">
              <div className="overflow-hidden rounded-[24px]">
                <Image
                  src="/images/hero-hills.jpg"
                  alt="Green hills hero background for Relay"
                  width={5464}
                  height={3640}
                  className="h-[34rem] w-full object-cover"
                  priority
                />
              </div>
              <div className="absolute inset-x-10 top-24 rounded-[28px] border border-white/70 bg-white/55 p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-stone-500">
                  <span>Relay surface</span>
                  <span>Lightweight sidecar</span>
                </div>
                <div className="mt-6 space-y-4">
                  <div className="rounded-[22px] bg-stone-950/90 p-4 text-stone-50">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-300">Current project</p>
                    <p className="mt-3 text-2xl font-semibold">Relay MVP</p>
                    <p className="mt-2 text-sm text-stone-300">Bound to this tab. Capture visible turns and pin what matters.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-[20px] bg-white/90 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Pinned constraint</p>
                      <p className="mt-2 text-sm leading-6 text-stone-700">Avoid vector databases and deep automation in v1.</p>
                    </div>
                    <div className="rounded-[20px] bg-white/90 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Target profile</p>
                      <p className="mt-2 text-sm leading-6 text-stone-700">Claude Code build packet with current state and next tasks.</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] bg-white/85 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Insert context</p>
                      <p className="mt-2 text-sm text-stone-700">One click. No auto-submit.</p>
                    </div>
                    <div className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50">Ready</div>
                  </div>
                </div>
              </div>

              <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between gap-6">
                <div className="max-w-xs rounded-[24px] border border-white/70 bg-white/60 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Inspiration reference</p>
                  <div className="mt-4 overflow-hidden rounded-[18px]">
                    <Image
                      src="/images/landing-inspiration.jpeg"
                      alt="Landing page inspiration reference"
                      width={680}
                      height={680}
                      className="h-28 w-full object-cover"
                    />
                  </div>
                </div>
                <div className="hidden rounded-full border border-white/80 bg-white/60 px-4 py-3 text-sm text-stone-700 backdrop-blur md:flex md:items-center">
                  Alternate background available
                  <ChevronRight className="ml-2 h-4 w-4" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <SectionHeading
          eyebrow="Workflow"
          title="A narrow loop that stays useful even without AI summarization."
          description="Relay is optimized around one behavior: preserve project state while the user moves between tools, not replace their workflow."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.title} className="p-6">
              <step.icon className="h-6 w-6 text-stone-600" />
              <h3 className="mt-6 text-2xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-stone-700">{step.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="architecture" className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading
            eyebrow="Architecture"
            title="Three layers, one source of truth."
            description="The extension handles site-specific capture and insertion, the web app handles product surfaces and APIs, and the backend data model stays relational and inspectable."
          />
          <Card className="overflow-hidden p-0">
            <div className="grid divide-y divide-stone-900/10 md:grid-cols-3 md:divide-x md:divide-y-0">
              {[
                ["Extension", "MV3 content runtime, background worker, side panel, popup, site adapters"],
                ["Web app", "Landing, dashboard, route handlers, services, DTO mapping"],
                ["Backend", "Supabase-ready repositories, capture schema, heuristics, context packets"]
              ].map(([title, copy]) => (
                <div key={title} className="p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">{title}</p>
                  <p className="mt-4 text-sm leading-7 text-stone-700">{copy}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section id="mvp" className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <Card className="grid gap-6 overflow-hidden bg-stone-950 p-8 text-stone-50 md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-400">MVP definition</p>
            <h2 className="mt-4 font-serif text-4xl tracking-tight">If one person can move between tools without re-briefing, the product is real.</h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-stone-300">
              The baseline repo already includes the monorepo layout, API surface, formatter strategy, adapter registry, and test scaffolding needed to harden the core loop.
            </p>
          </div>
          <div className="rounded-[24px] bg-white/8 p-6">
            <p className="text-sm font-semibold text-stone-200">Included now</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-stone-300">
              <li className="flex gap-3"><PanelRightOpen className="mt-1 h-4 w-4 shrink-0" />Public landing + dashboard shell</li>
              <li className="flex gap-3"><PanelRightOpen className="mt-1 h-4 w-4 shrink-0" />Capture, memory, context, binding, settings routes</li>
              <li className="flex gap-3"><PanelRightOpen className="mt-1 h-4 w-4 shrink-0" />Supported adapters for ChatGPT, Claude, and Perplexity</li>
            </ul>
          </div>
        </Card>
      </section>
    </main>
  )
}
