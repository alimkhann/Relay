import { Nav } from "./components/nav"
import { HeroSection } from "./components/hero-section"
import { HeroVisual } from "./components/hero-visual"
import { FeaturesSection } from "./components/features-section"
import { HowItWorks } from "./components/how-it-works"
import { McpSection } from "./components/mcp-section"
import { PricingSection } from "./components/pricing-section"
import { Faq } from "./components/faq"
import { BottomCta } from "./components/bottom-cta"
import { Footer } from "./components/footer"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { PostHogIdentity } from "@/components/telemetry/posthog-identity"
import { readSessionUserFromCookie } from "@/lib/auth/session-cookie"

export default async function LandingPage() {
  const sessionUser = await readSessionUserFromCookie()
  const isLoggedIn = sessionUser !== null

  return (
    <main className="bg-[#0a0a0a] text-[#f5f5f5] overflow-x-hidden">
      <PostHogIdentity userId={null} />
      <PageTelemetry
        surface="web-landing"
        area="page"
        pageName="landing"
        pageGroup="landing"
        message="Rendered the landing page."
      />
      <Nav isLoggedIn={isLoggedIn} />
      <HeroSection isLoggedIn={isLoggedIn} />
      <HeroVisual />
      <FeaturesSection />
      <HowItWorks />
      <McpSection />
      <PricingSection />
      <Faq />
      <BottomCta isLoggedIn={isLoggedIn} />
      <Footer />
    </main>
  )
}
