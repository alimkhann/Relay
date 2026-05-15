import { describe, expect, it } from "vitest"

import {
  createExternalSourceSchema,
  createSourceUploadSchema,
  promoteSourceCitationSchema,
  searchProjectSourcesSchema,
  sourcesToolSchema,
  sourceKindSchema,
  sourceStatusSchema,
} from "./source"

describe("source schemas", () => {
  it("accepts dashboard uploads for supported document types", () => {
    const parsed = createSourceUploadSchema.parse({
      fileName: "Roadmap.pdf",
      mimeType: "application/pdf",
      byteSize: 42_000,
      kind: "uploaded_file",
    })

    expect(parsed.fileName).toBe("Roadmap.pdf")
    expect(parsed.kind).toBe("uploaded_file")
  })

  it("rejects video uploads in v1", () => {
    expect(() =>
      createSourceUploadSchema.parse({
        fileName: "demo.mp4",
        mimeType: "video/mp4",
        byteSize: 42_000,
        kind: "uploaded_file",
      }),
    ).toThrow()
  })

  it("defines stable source kinds and lifecycle statuses", () => {
    expect(sourceKindSchema.options).toEqual(["uploaded_file", "repo_file", "external_docs", "package_docs"])
    expect(sourceStatusSchema.options).toEqual(["pending_upload", "processing", "ready", "failed", "archived", "stale"])
  })

  it("accepts public external docs and research source requests", () => {
    const parsed = createExternalSourceSchema.parse({
      url: "https://arxiv.org/abs/2401.00001",
      sourceType: "arxiv",
      displayName: "Interesting paper",
    })

    expect(parsed.kind).toBe("external_docs")
    expect(parsed.sourceType).toBe("arxiv")
    expect(parsed.url).toBe("https://arxiv.org/abs/2401.00001")
  })

  it("rejects private or unsupported external source targets", () => {
    expect(() => createExternalSourceSchema.parse({ url: "http://localhost:3000/docs" })).toThrow()
    expect(() => createExternalSourceSchema.parse({ url: "file:///tmp/notes.md" })).toThrow()
  })

  it("validates source search and promotion payloads", () => {
    expect(searchProjectSourcesSchema.parse({ query: "attention mechanisms", mode: "hybrid", limit: 20 })).toMatchObject({
      query: "attention mechanisms",
      mode: "hybrid",
      limit: 20,
    })
    expect(promoteSourceCitationSchema.parse({
      chunkId: "11111111-1111-1111-8111-111111111111",
      type: "note",
      content: "Transformers use self-attention.",
    }).type).toBe("note")
  })

  it("keeps the MCP sources tool as one compact action schema", () => {
    expect(sourcesToolSchema.parse({ action: "search", query: "transformer paper", limit: 5 }).action).toBe("search")
    expect(sourcesToolSchema.parse({ action: "index", url: "https://example.com/docs" }).action).toBe("index")
    expect(() => sourcesToolSchema.parse({ action: "search" })).toThrow()
  })
})
