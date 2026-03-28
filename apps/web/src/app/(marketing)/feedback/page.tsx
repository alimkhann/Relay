import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Feedback — Relay",
  description: "Send bugs, feature requests, and account questions to the Relay team.",
}

const FEEDBACK_OPTIONS = [
  {
    title: "Bug report",
    description: "Share what broke, where it happened, and how we can reproduce it.",
    href: "mailto:support@onrelay.app?subject=Relay%20bug%20report",
    cta: "Report a bug",
  },
  {
    title: "Feature request",
    description: "Tell us what would save you time, reduce friction, or make Relay more valuable.",
    href: "mailto:support@onrelay.app?subject=Relay%20feature%20request",
    cta: "Suggest a feature",
  },
  {
    title: "Billing or account help",
    description: "Use this for upgrade questions, billing issues, and account-access problems.",
    href: "mailto:support@onrelay.app?subject=Relay%20billing%20help",
    cta: "Contact support",
  },
] as const

export default function FeedbackPage() {
  return (
    <main className="bg-[#0a0a0a] px-5 py-24 text-white md:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/45">Feedback</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">Talk to Relay like an early product, not a black box.</h1>
          <p className="mt-5 text-base leading-8 text-white/60 md:text-lg">
            The fastest channel today is still direct email. Send bugs, ideas, or account questions and we will route them into the launch backlog.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {FEEDBACK_OPTIONS.map((option) => (
            <section key={option.title} className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-6">
              <p className="text-sm font-semibold text-white">{option.title}</p>
              <p className="mt-3 text-sm leading-7 text-white/55">{option.description}</p>
              <a
                href={option.href}
                className="mt-6 inline-flex items-center rounded-full border border-white/[0.14] px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/[0.24] hover:text-white"
              >
                {option.cta}
              </a>
            </section>
          ))}
        </div>

        <section className="mt-12 rounded-[28px] border border-white/[0.08] bg-[#131313] p-6 md:p-8">
          <p className="text-sm font-semibold text-white">What helps us respond faster</p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-white/55">
            <li>Include the AI tool, page, or command where the issue happened.</li>
            <li>Paste the project name and the exact error text if you have it.</li>
            <li>For feature requests, explain the workflow you are trying to speed up.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
