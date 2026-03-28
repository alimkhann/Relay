import type { Metadata } from "next"

import { createRepositoryBundle } from "@relay/db"

export const metadata: Metadata = {
  title: "Status — Relay",
  description: "Current service status for Relay.",
}

export const dynamic = "force-dynamic"

async function getStatusSnapshot() {
  const checkedAt = new Date().toISOString()

  try {
    const repositories = createRepositoryBundle()
    await repositories.provider.query("select 1")

    return {
      healthy: true,
      checkedAt,
      message: "Web app and database connectivity look healthy right now.",
    }
  } catch (error) {
    console.error("Public status check failed", error)

    return {
      healthy: false,
      checkedAt,
      message: "We are investigating a service issue right now.",
    }
  }
}

export default async function StatusPage() {
  const snapshot = await getStatusSnapshot()

  return (
    <main className="bg-[#0a0a0a] px-5 py-24 text-white md:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/45">Status</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">Relay system status.</h1>
          <p className="mt-5 text-base leading-8 text-white/60 md:text-lg">
            This is a lightweight public status snapshot during launch. If anything looks off, email support@onrelay.app and we will investigate quickly.
          </p>
        </div>

        <section className="mt-14 rounded-[28px] border border-white/[0.08] bg-[#131313] p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Current state</p>
              <p className={`mt-2 text-2xl font-semibold ${snapshot.healthy ? "text-emerald-300" : "text-amber-300"}`}>
                {snapshot.healthy ? "Operational" : "Investigating"}
              </p>
              <p className="mt-3 text-sm leading-7 text-white/55">{snapshot.message}</p>
            </div>

            <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-sm text-white/55">
              <p>Last checked</p>
              <p className="mt-1 font-mono text-xs text-white/75">{snapshot.checkedAt}</p>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-6">
            <p className="text-sm font-semibold text-white">What this checks</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-white/55">
              <li>Web app is serving publicly.</li>
              <li>Database connectivity succeeds for a basic query.</li>
              <li>Core launch pages like docs, privacy, terms, robots, and sitemap are reachable.</li>
            </ul>
          </section>

          <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-6">
            <p className="text-sm font-semibold text-white">Need help?</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-white/55">
              <li>Email support@onrelay.app for urgent launch issues.</li>
              <li>Visit `/feedback` to send bug reports or feature requests.</li>
              <li>
                Use
                <a href="/api/health" className="ml-1 text-white underline underline-offset-2">
                  `/api/health`
                </a>
                for the raw health endpoint response.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  )
}
