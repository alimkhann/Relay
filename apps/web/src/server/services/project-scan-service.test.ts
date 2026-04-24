import { afterEach, describe, expect, it, vi } from "vitest"

import { extractProjectMetadataFromHtml, normalizeScannableProjectUrl, scanProjectUrl } from "./project-scan-service"

describe("project scan service", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("extracts Open Graph metadata before title and meta description", () => {
    const result = extractProjectMetadataFromHtml(`
      <html>
        <head>
          <title>Fallback Title</title>
          <meta name="description" content="Fallback description">
          <meta property="og:title" content="Relay &amp; Context">
          <meta property="og:description" content="Keep project memory fresh.">
        </head>
      </html>
    `)

    expect(result).toEqual({
      name: "Relay & Context",
      description: "Keep project memory fresh.",
    })
  })

  it("rejects non-public or non-http URLs", () => {
    expect(() => normalizeScannableProjectUrl("file:///tmp/site.html")).toThrow("http:// or https://")
    expect(() => normalizeScannableProjectUrl("http://localhost:3000")).toThrow("public website")
    expect(() => normalizeScannableProjectUrl("http://192.168.1.10")).toThrow("public website")
  })

  it("fetches and returns capped sanitized metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<title>Example</title><meta name=\"description\" content=\"A useful app.\">")),
    )

    await expect(scanProjectUrl("https://example.com/#top")).resolves.toEqual({
      name: "Example",
      description: "A useful app.",
      url: "https://example.com/",
    })
  })

  it("returns a clean error when the URL cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network")
    }))

    await expect(scanProjectUrl("https://example.com")).rejects.toThrow("Relay could not fetch that URL.")
  })
})
