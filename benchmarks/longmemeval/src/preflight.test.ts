import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { getLatestMigrationFile } from "./preflight"

describe("getLatestMigrationFile", () => {
  it("returns the lexically latest sql migration file", () => {
    const dir = resolve(process.cwd(), "benchmarks/longmemeval/.tmp-preflight-test")
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, "0001_init.sql"), "")
    writeFileSync(resolve(dir, "0010_more.sql"), "")
    writeFileSync(resolve(dir, "0009_prev.sql"), "")

    expect(getLatestMigrationFile(dir)).toBe("0010_more.sql")

    rmSync(dir, { recursive: true, force: true })
  })
})
