import { describe, expect, it } from "vitest"

import {
  chunkExtractedText,
  classifyExternalSourceUrl,
  extractTextFromSourceBuffer,
  fetchExternalSourceText,
  normalizeExternalSourceUrl,
  validateSourceFile,
} from "./source-ingestion-service"

describe("source-ingestion-service", () => {
  it("validates supported source files and rejects unsupported media", () => {
    expect(validateSourceFile({
      fileName: "notes.md",
      mimeType: "text/markdown",
      byteSize: 1024,
      maxBytes: 10_000,
    }).extension).toBe("md")

    expect(() => validateSourceFile({
      fileName: "clip.mp4",
      mimeType: "video/mp4",
      byteSize: 1024,
      maxBytes: 10_000,
    })).toThrow(/not supported/i)
  })

  it("rejects empty-string MIME type instead of bypassing validation", () => {
    expect(() => validateSourceFile({
      fileName: "notes.md",
      mimeType: "",
      byteSize: 1024,
      maxBytes: 10_000,
    })).toThrow(/not supported/i)
  })

  it("allows null mimeType falling back to extension-only validation", () => {
    expect(validateSourceFile({
      fileName: "notes.md",
      mimeType: null,
      byteSize: 1024,
      maxBytes: 10_000,
    }).extension).toBe("md")
  })

  it("extracts text from plain text-like files", async () => {
    const text = await extractTextFromSourceBuffer({
      buffer: Buffer.from("# Plan\n\nShip sources."),
      fileName: "plan.md",
      mimeType: "text/markdown",
    })

    expect(text.text).toContain("Ship sources.")
    expect(text.metadata.format).toBe("markdown")
  })

  it("chunks extracted text with stable indexes and token estimates", () => {
    const chunks = chunkExtractedText("Alpha beta gamma.\n\nDelta epsilon zeta.", {
      sourceId: "source-1",
      versionId: "version-1",
      maxChars: 18,
    })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0]).toMatchObject({
      sourceId: "source-1",
      versionId: "version-1",
      chunkIndex: 0,
    })
    expect(chunks[0]!.tokenEstimate).toBeGreaterThan(0)
  })

  it("classifies public docs and research URLs without being developer-only", () => {
    expect(classifyExternalSourceUrl("https://arxiv.org/abs/2401.00001")).toBe("arxiv")
    expect(classifyExternalSourceUrl("https://example.edu/paper.pdf")).toBe("pdf")
    expect(classifyExternalSourceUrl("https://example.com/openapi.json")).toBe("openapi")
    expect(classifyExternalSourceUrl("https://example.com/llms.txt")).toBe("llms_txt")
    expect(classifyExternalSourceUrl("https://example.com/research/notes")).toBe("website")
  })

  it("normalizes external URLs and blocks unsupported or private targets", () => {
    expect(normalizeExternalSourceUrl("https://Example.com/docs#intro")).toBe("https://example.com/docs")
    expect(() => normalizeExternalSourceUrl("http://localhost/docs")).toThrow(/public URL/i)
    expect(() => normalizeExternalSourceUrl("https://127.0.0.1/docs")).toThrow(/public URL/i)
    expect(() => normalizeExternalSourceUrl("file:///tmp/source.md")).toThrow(/https/i)
  })

  it("fetches public external source text with content and size guards", async () => {
    const fetcher = async () => new Response("<main><h1>Paper</h1><p>Research notes.</p></main>", {
      headers: { "content-type": "text/html" },
    })
    const lookup = async () => [{ address: "93.184.216.34", family: 4 }]

    const result = await fetchExternalSourceText("https://example.com/paper", { fetcher, lookup })

    expect(result.text).toContain("Research notes.")
    expect(result.metadata.sourceType).toBe("website")
    expect(result.mimeType).toBe("text/html")
  })

  it("fetches the arxiv pdf variant but keeps the abstract URL canonical", async () => {
    const requested: string[] = []
    const fetcher = async (input: string | URL | Request) => {
      requested.push(String(input))
      return new Response("Abstract body text from the paper.", {
        headers: { "content-type": "text/plain" },
      })
    }
    const lookup = async () => [{ address: "151.101.0.1", family: 4 }]

    const result = await fetchExternalSourceText("https://arxiv.org/abs/2401.00001", { fetcher, lookup })

    expect(requested[0]).toBe("https://arxiv.org/pdf/2401.00001")
    expect(result.canonicalUrl).toBe("https://arxiv.org/abs/2401.00001")
    expect(result.metadata.sourceType).toBe("arxiv")
  })

  it("rejects a public host that resolves to a private address", async () => {
    const fetcher = async () => new Response("nope")
    const lookup = async () => [{ address: "169.254.169.254", family: 4 }]

    await expect(
      fetchExternalSourceText("https://metadata.example.com/latest", { fetcher, lookup }),
    ).rejects.toThrow(/public URL/i)
  })
})
