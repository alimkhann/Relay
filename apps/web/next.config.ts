import path from "node:path"
import { withPostHogConfig } from "@posthog/nextjs-config"
import type { NextConfig } from "next"

import { DISCOVERY_LINK_HEADER } from "./src/lib/site-config"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  transpilePackages: ["@relay/shared", "@relay/db", "@relay/formatters", "@relay/adapters"],
  images: {
    formats: ["image/avif", "image/webp"]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.posthog.com https://*.vercel-insights.com https://*.vercel-scripts.com https://*.onrelay.app; frame-ancestors 'none'" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" }
        ]
      },
      {
        source: "/",
        headers: [
          { key: "Link", value: DISCOVERY_LINK_HEADER },
        ]
      },
      {
        source: "/docs",
        headers: [
          { key: "Link", value: DISCOVERY_LINK_HEADER },
        ]
      },
      {
        source: "/docs/:path*",
        headers: [
          { key: "Link", value: DISCOVERY_LINK_HEADER },
        ]
      }
    ]
  }
}

const sourcemapUploadEnabled = Boolean(
  process.env.VERCEL_ENV === "production" &&
    process.env.POSTHOG_API_KEY &&
    process.env.POSTHOG_PROJECT_ID
)

export default sourcemapUploadEnabled
  ? withPostHogConfig(nextConfig, {
      personalApiKey: process.env.POSTHOG_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      sourcemaps: {
        enabled: true,
        releaseName: "relay-web",
        releaseVersion: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA,
        deleteAfterUpload: true,
      },
    })
  : nextConfig
