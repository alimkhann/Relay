import { describe, expect, it } from "vitest"

import { crawlExternalSourcePages, parseLlmsTxtLinks, parseSitemapUrls } from "./source-crawl-service"

describe("source-crawl-service", () => {
  it("parses llms.txt markdown links into same-origin source URLs", () => {
    const links = parseLlmsTxtLinks("https://docs.example.com", `
# Example Docs

- [Checkout](/payments/checkout.md)
- [Webhooks](https://docs.example.com/webhooks.md)
- [Offsite](https://other.example.com/nope.md)
`)

    expect(links).toEqual([
      { title: "Checkout", url: "https://docs.example.com/payments/checkout.md" },
      { title: "Webhooks", url: "https://docs.example.com/webhooks.md" },
    ])
  })

  it("parses sitemap loc entries into same-origin source URLs", () => {
    const urls = parseSitemapUrls("https://docs.example.com/docs", `
<urlset>
  <url><loc>https://docs.example.com/docs/a</loc></url>
  <url><loc>https://docs.example.com/docs/b</loc></url>
  <url><loc>https://external.example.com/docs/c</loc></url>
</urlset>
`)

    expect(urls).toEqual([
      "https://docs.example.com/docs/a",
      "https://docs.example.com/docs/b",
    ])
  })

  it("crawls root, llms.txt, and sitemap pages with hashes and locators", async () => {
    const bodies = new Map<string, string>([
      ["https://docs.example.com", "<main><h1>Root Docs</h1><p>Start here.</p></main>"],
      ["https://docs.example.com/llms.txt", "- [Checkout](/checkout.md)"],
      ["https://docs.example.com/sitemap.xml", "<urlset><url><loc>https://docs.example.com/webhooks</loc></url></urlset>"],
      ["https://docs.example.com/checkout.md", "# Checkout\nCreate a Checkout Session."],
      ["https://docs.example.com/webhooks", "<main><h1>Webhooks</h1><p>Verify signatures.</p></main>"],
    ])
    const fetcher = async (input: string | URL | Request) => {
      const body = bodies.get(String(input))
      if (!body) return new Response("not found", { status: 404 })
      return new Response(body, {
        headers: {
          "content-type": String(input).endsWith(".xml") ? "application/xml" : "text/html",
          etag: `"${String(input).length}"`,
        },
      })
    }

    const pages = await crawlExternalSourcePages("https://docs.example.com", {
      fetcher,
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      maxPages: 5,
    })

    expect(pages.map((page) => page.url)).toEqual([
      "https://docs.example.com/",
      "https://docs.example.com/checkout.md",
      "https://docs.example.com/webhooks",
    ])
    expect(pages[0]).toMatchObject({
      title: "Root Docs",
      headingPath: ["Root Docs"],
      contentHash: expect.any(String),
      etag: "\"24\"",
    })
    expect(pages[2]!.content).toContain("Verify signatures.")
  })

  it("extracts OpenAPI JSON into operation-oriented text", async () => {
    const fetcher = async (input: string | URL | Request) => {
      if (String(input) !== "https://api.example.com/openapi.json") return new Response("not found", { status: 404 })
      return new Response(JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Billing API", version: "2026-05-18" },
        paths: {
          "/checkout/sessions": {
            post: {
              operationId: "createCheckoutSession",
              summary: "Create a Checkout Session",
              description: "Creates a hosted checkout flow.",
              tags: ["checkout"],
            },
          },
        },
      }), { headers: { "content-type": "application/json" } })
    }

    const pages = await crawlExternalSourcePages("https://api.example.com/openapi.json", {
      fetcher,
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    })

    expect(pages[0]).toMatchObject({
      title: "OpenAPI: Billing API",
      contentType: "application/json",
    })
    expect(pages[0]!.content).toContain("POST /checkout/sessions")
    expect(pages[0]!.content).toContain("createCheckoutSession")
  })

  it("discovers GitHub repository README and docs markdown through the public tree", async () => {
    const bodies = new Map<string, { body: string; contentType: string }>([
      ["https://github.com/acme/sdk", { body: "<html><h1>Repository</h1></html>", contentType: "text/html" }],
      ["https://api.github.com/repos/acme/sdk/git/trees/HEAD?recursive=1", {
        body: JSON.stringify({ tree: [
          { path: "README.md", type: "blob" },
          { path: "docs/webhooks.md", type: "blob" },
          { path: "src/index.ts", type: "blob" },
        ] }),
        contentType: "application/json",
      }],
      ["https://raw.githubusercontent.com/acme/sdk/HEAD/README.md", { body: "# SDK\nInstall the SDK.", contentType: "text/markdown" }],
      ["https://raw.githubusercontent.com/acme/sdk/HEAD/docs/README.md", { body: "not found", contentType: "text/plain" }],
      ["https://raw.githubusercontent.com/acme/sdk/HEAD/docs/webhooks.md", { body: "# Webhooks\nVerify signatures.", contentType: "text/markdown" }],
    ])
    const fetcher = async (input: string | URL | Request) => {
      const entry = bodies.get(String(input))
      if (!entry || entry.body === "not found") return new Response("not found", { status: 404 })
      return new Response(entry.body, { headers: { "content-type": entry.contentType } })
    }

    const pages = await crawlExternalSourcePages("https://github.com/acme/sdk", {
      fetcher,
      lookup: async () => [{ address: "140.82.112.4", family: 4 }],
      maxPages: 5,
    })

    expect(pages.map((page) => page.url)).toContain("https://raw.githubusercontent.com/acme/sdk/HEAD/README.md")
    expect(pages.map((page) => page.url)).toContain("https://raw.githubusercontent.com/acme/sdk/HEAD/docs/webhooks.md")
    expect(pages.find((page) => page.url.endsWith("/docs/webhooks.md"))?.content).toContain("Verify signatures.")
  })
})
