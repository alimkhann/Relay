import { Nav } from "../components/nav"
import { PricingSection } from "../components/pricing-section"
import { Footer } from "../components/footer"

export const metadata = {
  title: "Pricing — Relay",
  description: "Free, Starter, and Pro plans for Relay — the AI memory sidecar.",
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <div className="pt-24">
        <PricingSection />
      </div>
      <Footer />
    </div>
  )
}
