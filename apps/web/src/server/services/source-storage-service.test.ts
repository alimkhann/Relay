import { describe, expect, it } from "vitest"

import {
  buildSourceObjectKey,
  decryptSourceBuffer,
  encryptSourceBuffer,
} from "./source-storage-service"

describe("source-storage-service", () => {
  it("builds stable project-scoped object keys without leaking the original filename", () => {
    const key = buildSourceObjectKey({
      projectId: "project-1",
      sourceId: "source-1",
      versionId: "version-1",
      extension: "pdf",
    })

    expect(key).toBe("projects/project-1/sources/source-1/versions/version-1/original.pdf")
  })

  it("encrypts source bytes with authenticated metadata and decrypts them", () => {
    const plaintext = Buffer.from("Relay source content")
    const encrypted = encryptSourceBuffer(plaintext, {
      projectId: "project-1",
      sourceId: "source-1",
      versionId: "version-1",
      masterKey: "test-master-key",
    })

    expect(encrypted.ciphertext.equals(plaintext)).toBe(false)
    expect(encrypted.algorithm).toBe("aes-256-gcm")

    const decrypted = decryptSourceBuffer(encrypted, {
      projectId: "project-1",
      sourceId: "source-1",
      versionId: "version-1",
      masterKey: "test-master-key",
    })

    expect(decrypted.toString("utf8")).toBe("Relay source content")
  })
})
