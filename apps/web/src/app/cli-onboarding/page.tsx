import { redirect } from "next/navigation"

interface CliOnboardingPageProps {
  searchParams: Promise<{ code?: string }>
}

export default async function CliOnboardingPage({ searchParams }: CliOnboardingPageProps) {
  const { code } = await searchParams

  if (!code) {
    redirect("/dashboard")
  }
  redirect(`/wizard-onboarding?code=${encodeURIComponent(code)}`)
}
