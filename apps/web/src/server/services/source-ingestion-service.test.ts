import { describe, expect, it } from "vitest"

import {
  chunkExtractedText,
  extractTextFromSourceBuffer,
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
})
