import { redirect } from "next/navigation"

import { CliOnboardingConfirm } from "@/components/cli/cli-onboarding-confirm"
import { requirePageViewer } from "@/server/policies/viewer"

interface CliOnboardingPageProps {
  searchParams: Promise<{ code?: string }>
}

export default async function CliOnboardingPage({ searchParams }: CliOnboardingPageProps) {
  const { code } = await searchParams

  if (!code) {
    redirect("/dashboard")
  }

  await requirePageViewer(`/cli-onboarding?code=${code}`)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--relay-bg)] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-[var(--relay-ink)]">Relay Setup</h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Authorize this device to connect to Relay.
          </p>
        </div>

        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6">
          <CliOnboardingConfirm sessionCode={code} />
        </div>

        <p className="text-center text-[11px] text-[var(--relay-muted)]">
          Not you? Close this tab to cancel.
        </p>
      </div>
    </div>
  )
}
