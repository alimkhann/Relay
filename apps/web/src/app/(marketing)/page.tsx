import { unstable_noStore as noStore } from "next/cache"
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
import { pickRandomLandingBackground } from "./background-images"

export default function LandingPage() {
  noStore()

  const backgroundSrc = pickRandomLandingBackground()

  return (
    <main className="bg-[#0a0a0a] text-[#f5f5f5] overflow-x-hidden">
      <Nav />
      <HeroSection backgroundSrc={backgroundSrc} />
      <HeroVisual />
      <FeaturesSection />
      <HowItWorks />
      <McpSection />
      <PricingSection />
      <Faq />
      <BottomCta backgroundSrc={backgroundSrc} />
      <Footer />
    </main>
  )
}
