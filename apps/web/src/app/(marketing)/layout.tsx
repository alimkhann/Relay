import type { Metadata } from "next"

export const metadata: Metadata = {
  metadataBase: new URL("https://onrelay.app"),
  title: "Relay — Stop repeating yourself to every AI",
  description:
    "Relay captures decisions, tasks, and constraints from your AI chats and keeps a living project brief synced across ChatGPT, Claude, Gemini, Cursor, Claude Code, and 20+ other tools via MCP.",
  openGraph: {
    title: "Relay — Stop repeating yourself to every AI",
    description:
      "Relay captures context from your AI chats and keeps a living project brief synced across ChatGPT, Claude, Cursor, Claude Code, and 20+ tools.",
    images: [{ url: "/images/hero-bg.jpg", width: 1920, height: 1080 }],
    type: "website",
    url: "https://onrelay.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay — Stop repeating yourself to every AI",
    description:
      "Relay captures context from your AI chats and keeps a living project brief synced across ChatGPT, Claude, Cursor, Claude Code, and 20+ tools.",
    images: ["/images/hero-bg.jpg"],
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Relay",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Chrome, Web",
  description:
    "Cross-AI context management. Relay captures decisions from your AI chats and keeps a living project brief synced across ChatGPT, Claude, Cursor, Claude Code, and 20+ tools via MCP.",
  url: "https://onrelay.app",
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "9",
      priceCurrency: "USD",
      billingIncrement: "month",
    },
  ],
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Force dark mode for marketing pages regardless of user preference */}
      <div className="dark" style={{ colorScheme: "dark" }}>
        {children}
      </div>
    </>
  )
}
