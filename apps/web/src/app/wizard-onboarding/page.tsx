import { redirect } from "next/navigation"

import { WizardOnboardingConfirm } from "@/components/wizard/wizard-onboarding-confirm"
import { requirePageViewer } from "@/server/policies/viewer"

interface WizardOnboardingPageProps {
  searchParams: Promise<{ code?: string }>
}

export default async function WizardOnboardingPage({ searchParams }: WizardOnboardingPageProps) {
  const { code } = await searchParams

  if (!code) {
    redirect("/dashboard")
  }

  await requirePageViewer(`/wizard-onboarding?code=${code}`)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--relay-bg)] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-[var(--relay-ink)]">Relay Wizard</h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Connecting your tool to Relay.
          </p>
        </div>

        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6">
          <WizardOnboardingConfirm sessionCode={code} />
        </div>

        <p className="text-center text-[11px] text-[var(--relay-muted)]">
          Not you? Close this tab to cancel.
        </p>
      </div>
    </div>
  )
}
