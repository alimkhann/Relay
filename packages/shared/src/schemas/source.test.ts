import { describe, expect, it } from "vitest"

import { createSourceUploadSchema, sourceKindSchema, sourceStatusSchema } from "./source"

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
})
