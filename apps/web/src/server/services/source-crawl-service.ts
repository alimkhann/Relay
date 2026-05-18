import { assertPublicHttpsUrl, readCappedBody, type DnsLookup } from "@/server/lib/safe-url"

import { normalizeExternalSourceUrl, sha256Hex } from "./source-ingestion-service"

const CRAWL_FETCH_TIMEOUT_MS = 20_000

export interface CrawledSourcePage {
  url: string
  canonicalUrl: string
  title: string | null
  headingPath: string[]
  content: string
  contentHash: string
  contentType: string
  etag: string | null
  lastModified: string | null
  metadata: Record<string, unknown>
}

function stripHtmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function extractTitle(raw: string, contentType: string) {
  const markdownHeading = raw.match(/^#\s+(.+)$/m)?.[1]
  if (markdownHeading) return markdownHeading.trim().slice(0, 255)
  if (contentType.includes("html")) {
    const h1 = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    const title = h1 ?? raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    return title ? stripHtmlToText(title).slice(0, 255) : null
  }
  return null
}

function extractHeadingPath(raw: string, contentType: string) {
  const markdownHeadings = Array.from(raw.matchAll(/^#{1,3}\s+(.+)$/gm))
    .map((match) => (match[1] ?? "").trim())
    .filter(Boolean)
    .slice(0, 4)
  if (markdownHeadings.length > 0) return markdownHeadings
  if (contentType.includes("html")) {
    const headings = Array.from(raw.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi))
      .map((match) => stripHtmlToText(match[1] ?? ""))
      .filter(Boolean)
    return headings.slice(0, 4)
  }
  return []
}

function sameOrigin(baseUrl: string, url: string) {
  return new URL(baseUrl).origin === new URL(url).origin
}

function safeSameOriginUrl(baseUrl: string, href: string): string | null {
  try {
    const url = new URL(href, baseUrl).toString()
    if (!sameOrigin(baseUrl, url)) return null
    return normalizeExternalSourceUrl(url)
  } catch {
    return null
  }
}

function parseGitHubRepoUrl(value: string): { owner: string; repo: string; path: string | null } | null {
  const url = new URL(value)
  if (url.hostname !== "github.com") return null
  const parts = url.pathname.split("/").filter(Boolean)
  if (parts.length < 2) return null
  const [owner, repo] = parts
  if (!owner || !repo) return null
  const blobIndex = parts.indexOf("blob")
  const treeIndex = parts.indexOf("tree")
  const pathIndex = blobIndex >= 0 ? blobIndex + 2 : treeIndex >= 0 ? treeIndex + 2 : -1
  return {
    owner,
    repo: repo.replace(/\.git$/i, ""),
    path: pathIndex > 0 && parts[pathIndex] ? parts.slice(pathIndex).join("/") : null,
  }
}

function githubRawUrl(owner: string, repo: string, path: string) {
  return normalizeExternalSourceUrl(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`)
}

export function parseLlmsTxtLinks(baseUrl: string, text: string): Array<{ title: string; url: string }> {
  const links: Array<{ title: string; url: string }> = []
  const seen = new Set<string>()
  for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    const title = (match[1] ?? "").trim()
    const url = safeSameOriginUrl(baseUrl, (match[2] ?? "").trim())
    if (!title || !url || seen.has(url)) continue
    seen.add(url)
    links.push({ title, url })
  }
  return links
}

export function parseSitemapUrls(baseUrl: string, xml: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const url = safeSameOriginUrl(baseUrl, (match[1] ?? "").trim())
    if (!url || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

function extractOpenApiText(raw: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const spec = parsed as Record<string, unknown>
  if (typeof spec.openapi !== "string" && typeof spec.swagger !== "string") return null
  const info = spec.info && typeof spec.info === "object" ? spec.info as Record<string, unknown> : {}
  const sections: string[] = [
    `OpenAPI: ${typeof info.title === "string" ? info.title : "Untitled API"}`,
  ]
  if (typeof info.version === "string") sections.push(`Version: ${info.version}`)
  if (typeof info.description === "string") sections.push(info.description)
  const paths = spec.paths && typeof spec.paths === "object" ? spec.paths as Record<string, unknown> : {}
  for (const [pathName, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== "object") continue
    for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
      if (!["get", "post", "put", "patch", "delete", "options", "head"].includes(method.toLowerCase())) continue
      const op = operation && typeof operation === "object" ? operation as Record<string, unknown> : {}
      const lines = [`${method.toUpperCase()} ${pathName}`]
      if (typeof op.operationId === "string") lines.push(`operationId: ${op.operationId}`)
      if (typeof op.summary === "string") lines.push(op.summary)
      if (typeof op.description === "string") lines.push(op.description)
      if (Array.isArray(op.tags) && op.tags.length > 0) lines.push(`tags: ${op.tags.map(String).join(", ")}`)
      sections.push(lines.join("\n"))
    }
  }
  return sections.join("\n\n").trim()
}

async function fetchText(url: string, options: { fetcher: typeof fetch; lookup?: DnsLookup; maxBytes: number }) {
  const safeUrl = (await assertPublicHttpsUrl(url, { lookup: options.lookup })).toString()
  let response = await options.fetcher(safeUrl, {
    headers: { accept: "text/html,text/plain,text/markdown,application/xml,text/xml,application/json,*/*;q=0.2" },
    redirect: "follow",
    signal: AbortSignal.timeout(CRAWL_FETCH_TIMEOUT_MS),
  })
  if (!response.ok && safeUrl.endsWith("/")) {
    response = await options.fetcher(safeUrl.slice(0, -1), {
      headers: { accept: "text/html,text/plain,text/markdown,application/xml,text/xml,application/json,*/*;q=0.2" },
      redirect: "follow",
      signal: AbortSignal.timeout(CRAWL_FETCH_TIMEOUT_MS),
    })
  }
  if (!response.ok) return null
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "text/plain"
  const buffer = await readCappedBody(response, options.maxBytes)
  return {
    url: normalizeExternalSourceUrl(safeUrl),
    raw: buffer.toString("utf8"),
    contentType,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    byteSize: buffer.byteLength,
  }
}

async function discoverGitHubMarkdownUrls(inputUrl: string, options: { fetcher: typeof fetch; lookup?: DnsLookup; maxBytes: number; maxPages: number }) {
  const repo = parseGitHubRepoUrl(inputUrl)
  if (!repo) return []
  if (repo.path && /\.(md|mdx|txt)$/i.test(repo.path)) {
    return [githubRawUrl(repo.owner, repo.repo, repo.path)]
  }
  const urls: string[] = [
    githubRawUrl(repo.owner, repo.repo, "README.md"),
    githubRawUrl(repo.owner, repo.repo, "docs/README.md"),
  ]
  const treeUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/HEAD?recursive=1`
  const tree = await fetchText(treeUrl, {
    fetcher: options.fetcher,
    lookup: options.lookup,
    maxBytes: options.maxBytes,
  }).catch(() => null)
  if (!tree) return urls
  let parsed: { tree?: Array<{ path?: string; type?: string }> }
  try {
    parsed = JSON.parse(tree.raw) as { tree?: Array<{ path?: string; type?: string }> }
  } catch {
    return urls
  }
  for (const item of parsed.tree ?? []) {
    if (item.type !== "blob" || !item.path) continue
    if (!/^docs\/.+\.(md|mdx)$/i.test(item.path) && !/^(README|CHANGELOG|CONTRIBUTING)\.md$/i.test(item.path)) continue
    const raw = githubRawUrl(repo.owner, repo.repo, item.path)
    if (!urls.includes(raw)) urls.push(raw)
    if (urls.length >= options.maxPages) break
  }
  return urls
}

async function fetchPage(url: string, options: { fetcher: typeof fetch; lookup?: DnsLookup; maxBytes: number }): Promise<CrawledSourcePage | null> {
  const fetched = await fetchText(url, options)
  if (!fetched) return null
  const structured = fetched.contentType.includes("json") || /\.json$/i.test(new URL(fetched.url).pathname)
    ? extractOpenApiText(fetched.raw)
    : null
  const content = structured ?? (fetched.contentType.includes("html") ? stripHtmlToText(fetched.raw) : fetched.raw.trim())
  if (!content) return null
  const title = structured
    ? structured.split("\n")[0]?.trim().slice(0, 255) || "OpenAPI"
    : extractTitle(fetched.raw, fetched.contentType)
  const headingPath = extractHeadingPath(fetched.raw, fetched.contentType)
  return {
    url: fetched.url,
    canonicalUrl: fetched.url,
    title,
    headingPath,
    content,
    contentHash: sha256Hex(content),
    contentType: fetched.contentType,
    etag: fetched.etag,
    lastModified: fetched.lastModified,
    metadata: { byteSize: fetched.byteSize },
  }
}

export async function crawlExternalSourcePages(inputUrl: string, options: {
  fetcher?: typeof fetch
  lookup?: DnsLookup
  maxPages?: number
  maxBytesPerPage?: number
} = {}): Promise<CrawledSourcePage[]> {
  const rootUrl = normalizeExternalSourceUrl(inputUrl)
  const root = new URL(rootUrl)
  const fetcher = options.fetcher ?? fetch
  const maxPages = options.maxPages ?? 25
  const maxBytes = options.maxBytesPerPage ?? 1_000_000
  const githubRepo = parseGitHubRepoUrl(rootUrl)
  const pageUrls: string[] = githubRepo ? [] : [rootUrl]
  const seen = new Set(pageUrls)

  if (githubRepo) {
    const githubUrls = await discoverGitHubMarkdownUrls(rootUrl, {
      fetcher,
      lookup: options.lookup,
      maxBytes,
      maxPages,
    })
    for (const url of githubUrls) {
      if (seen.has(url)) continue
      seen.add(url)
      pageUrls.push(url)
    }
  } else {
    const llmsUrl = `${root.origin}/llms.txt`
    const llms = await fetchText(llmsUrl, { fetcher, lookup: options.lookup, maxBytes }).catch(() => null)
    if (llms) {
      for (const link of parseLlmsTxtLinks(rootUrl, llms.raw)) {
        if (seen.has(link.url)) continue
        seen.add(link.url)
        pageUrls.push(link.url)
      }
    }

    const sitemapUrl = `${root.origin}/sitemap.xml`
    const sitemap = await fetchText(sitemapUrl, { fetcher, lookup: options.lookup, maxBytes }).catch(() => null)
    if (sitemap) {
      for (const url of parseSitemapUrls(rootUrl, sitemap.raw)) {
        if (seen.has(url)) continue
        seen.add(url)
        pageUrls.push(url)
      }
    }
  }

  const pages: CrawledSourcePage[] = []
  for (const url of pageUrls.slice(0, maxPages)) {
    const page = await fetchPage(url, { fetcher, lookup: options.lookup, maxBytes }).catch(() => null)
    if (page) pages.push(page)
  }
  return pages
}
