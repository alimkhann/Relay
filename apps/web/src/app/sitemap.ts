import type { MetadataRoute } from "next"
import { APP_ORIGIN } from "@/lib/site-config"

const routes = [
  "",
  "/get-started",
  "/machine",
  "/pricing",
  "/roadmap",
  "/status",
  "/docs",
  "/docs/api",
  "/docs/concepts",
  "/docs/extension",
  "/docs/mcp",
  "/docs/plans",
  "/privacy",
  "/terms",
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return routes.map((route) => ({
    url: `${APP_ORIGIN}${route}`,
    lastModified: now,
    changeFrequency: route.startsWith("/docs") ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/get-started" ? 0.9 : 0.7,
  }))
}
