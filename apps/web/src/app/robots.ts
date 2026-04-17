import type { MetadataRoute } from "next"

const APP_URL = "https://onrelay.app"

export default function robots(): MetadataRoute.Robots {
  const privateDisallow = [
    "/api/",
    "/dashboard",
    "/projects/",
    "/settings",
    "/memory",
    "/activity",
    "/brief",
    "/sign-in",
    "/cli-onboarding",
    "/wizard-onboarding",
    "/mcp/authorize",
  ]

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privateDisallow },
      { userAgent: "GPTBot", allow: "/", disallow: privateDisallow },
      { userAgent: "OAI-SearchBot", allow: "/", disallow: privateDisallow },
      { userAgent: "ChatGPT-User", allow: "/", disallow: privateDisallow },
      { userAgent: "PerplexityBot", allow: "/", disallow: privateDisallow },
      { userAgent: "Perplexity-User", allow: "/", disallow: privateDisallow },
      { userAgent: "ClaudeBot", allow: "/", disallow: privateDisallow },
      { userAgent: "Claude-Web", allow: "/", disallow: privateDisallow },
      { userAgent: "anthropic-ai", allow: "/", disallow: privateDisallow },
      { userAgent: "Google-Extended", allow: "/", disallow: privateDisallow },
      { userAgent: "CCBot", allow: "/", disallow: privateDisallow },
      { userAgent: "Applebot-Extended", allow: "/", disallow: privateDisallow },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  }
}
