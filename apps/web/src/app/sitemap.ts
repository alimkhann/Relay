import type { MetadataRoute } from "next"

const APP_URL = "https://onrelay.app"

const routes = [
  "",
  "/get-started",
  "/docs",
  "/docs/api",
  "/docs/concepts",
  "/docs/extension",
  "/docs/mcp",
  "/docs/plans",
  "/feedback",
  "/privacy",
  "/roadmap",
  "/status",
  "/terms",
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return routes.map((route) => ({
    url: `${APP_URL}${route}`,
    lastModified: now,
    changeFrequency: route.startsWith("/docs") ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/get-started" ? 0.9 : 0.7,
  }))
}
