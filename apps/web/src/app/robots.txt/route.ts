const PRIVATE_DISALLOW = [
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

const USER_AGENTS = [
  "*",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
] as const

const BODY = `${USER_AGENTS.map((agent) => [
  `User-Agent: ${agent}`,
  "Allow: /",
  ...PRIVATE_DISALLOW.map((path) => `Disallow: ${path}`),
].join("\n")).join("\n\n")}

Content-Signal: ai-train=no, search=yes, ai-input=yes
Host: https://www.onrelay.app
Sitemap: https://www.onrelay.app/sitemap.xml
`

export async function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300",
    },
  })
}
