import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Roadmap — Relay",
  description: "See what Relay is focusing on now, next, and later.",
}

const LANES = [
  {
    title: "Now",
    items: [
      "Chrome Web Store launch prep and reviewer readiness",
      "Launch QA across billing, onboarding, and extension setup",
      "Trust polish around analytics consent, support, and public docs",
    ],
  },
  {
    title: "Next",
    items: [
      "Lifecycle emails for onboarding, inactivity, and education",
      "A stronger public feedback loop for bugs and feature requests",
      "Search Console and Bing submission now that sitemap support is live",
    ],
  },
  {
    title: "Later",
    items: [
      "A fuller public feature board with voting or request tracking",
      "More polished launch assets and guided onboarding media",
      "Operational polish like richer public status and release notes",
    ],
  },
] as const

export default function RoadmapPage() {
  return (
    <main className="bg-[#0a0a0a] px-5 py-24 text-white md:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/45">Roadmap</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">A lightweight public roadmap for launch season.</h1>
          <p className="mt-5 text-base leading-8 text-white/60 md:text-lg">
            This page is here to make priorities visible, not to promise exact dates. If something would materially improve your workflow, tell us at support@onrelay.app.
          </p>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {LANES.map((lane) => (
            <section key={lane.title} className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-6">
              <p className="text-sm font-semibold text-white">{lane.title}</p>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-white/55">
                {lane.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
