import { Nav } from "../components/nav"
import { McpVideoHero } from "../components/mcp-video-hero"
import { McpSection } from "../components/mcp-section"
import { Footer } from "../components/footer"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { readSessionUserFromCookie } from "@/lib/auth/session-cookie"

export const metadata = {
  title: "MCP Integration — Relay",
  description:
    "Connect Relay to Claude Code, Cursor, Codex, and any MCP-compatible coding agent. One command setup.",
}

export default async function McpPage() {
  const sessionUser = await readSessionUserFromCookie()

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <PageTelemetry
        surface="web-landing"
        area="marketing"
        pageName="mcp"
        pageGroup="landing"
        message="Rendered the MCP marketing page."
      />
      <Nav isLoggedIn={sessionUser !== null} />
      <McpVideoHero />
      <McpSection standalone />
      <Footer />
    </main>
  )
}