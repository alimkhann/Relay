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

    const result = await fetchExternalSourceText("https://example.com/paper", { fetcher })

    expect(result.text).toContain("Research notes.")
    expect(result.metadata.sourceType).toBe("website")
    expect(result.mimeType).toBe("text/html")
  })
})
