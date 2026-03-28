import type { MetadataRoute } from "next"

const APP_URL = "https://onrelay.app"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
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
        ],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  }
}
