import { estimateMarkdownTokens, getPublicMarkdown } from "@/server/discovery/markdown-content"

function buildHeaders(markdown: string) {
  return new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300",
    "Vary": "Accept",
    "x-markdown-tokens": String(estimateMarkdownTokens(markdown)),
  })
}

function resolveMarkdown(request: Request) {
  const { searchParams } = new URL(request.url)
  const pathname = searchParams.get("pathname")

  if (!pathname) {
    return null
  }

  return getPublicMarkdown(pathname)
}

export async function GET(request: Request) {
  const markdown = resolveMarkdown(request)

  if (!markdown) {
    return new Response("Markdown variant not found.\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  return new Response(markdown, {
    headers: buildHeaders(markdown),
  })
}

export async function HEAD(request: Request) {
  const markdown = resolveMarkdown(request)

  if (!markdown) {
    return new Response(null, { status: 404 })
  }

  return new Response(null, {
    headers: buildHeaders(markdown),
  })
}
