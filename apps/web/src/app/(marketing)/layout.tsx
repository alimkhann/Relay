import type { Metadata } from "next"
import { APP_ORIGIN } from "@/lib/site-config"
import { WebMcpBootstrap } from "@/components/webmcp/webmcp-bootstrap"

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: "Relay — Your AI tools finally remember your work",
  description:
    "Relay captures decisions, tasks, and constraints from your AI chats and keeps a living project brief synced across ChatGPT, Claude, Gemini, Cursor, Claude Code, and 20+ other tools via MCP.",
  openGraph: {
    title: "Relay — Your AI tools finally remember your work",
    description:
      "Relay captures context from your AI chats and keeps a living project brief synced across ChatGPT, Claude, Cursor, Claude Code, and 20+ tools.",
    type: "website",
    url: APP_ORIGIN,
    siteName: "Relay",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay — Your AI tools finally remember your work",
    description:
      "Relay captures context from your AI chats and keeps a living project brief synced across ChatGPT, Claude, Cursor, Claude Code, and 20+ tools.",
    creator: "@onrelayapp",
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
  url: APP_ORIGIN,
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
    },
    {
      "@type": "Offer",
      name: "Starter",
      price: "8",
      priceCurrency: "USD",
      billingIncrement: "month",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "12",
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
    <div className="dark" style={{ colorScheme: "dark" }}>
      <WebMcpBootstrap />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </div>
  )
}
