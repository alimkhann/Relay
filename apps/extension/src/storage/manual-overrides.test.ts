import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// In-memory chrome.storage.local stub so the manual-override map can be tested
// without a browser. Must be installed before importing the module under test,
// because storage/routing.ts captures chrome.storage.local at module load.
const store: Record<string, unknown> = {}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key]
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys]
          const out: Record<string, unknown> = {}
          for (const key of list) {
            if (key in store) out[key] = store[key]
          }
          return out
        },
        set: async (values: Record<string, unknown>) => {
          Object.assign(store, values)
        },
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function loadModule() {
  vi.resetModules()
  return import("./routing")
}

describe("manual project overrides", () => {
  it("remembers and reads an override per chat key", async () => {
    const mod = await loadModule()
    await mod.rememberManualOverride("claude:conversation:abc", "project_personal")

    expect(await mod.readManualOverride("claude:conversation:abc")).toMatchObject({
      projectId: "project_personal",
    })
    // A different chat key is unaffected.
    expect(await mod.readManualOverride("claude:conversation:zzz")).toBeNull()
  })

  it("overwrites the override for the same chat key", async () => {
    const mod = await loadModule()
    await mod.rememberManualOverride("chatgpt:path:/c/1", "project_a")
    await mod.rememberManualOverride("chatgpt:path:/c/1", "project_b")

    expect(await mod.readManualOverride("chatgpt:path:/c/1")).toMatchObject({
      projectId: "project_b",
    })
  })

  it("clears an override without touching others", async () => {
    const mod = await loadModule()
    await mod.rememberManualOverride("k1", "project_a")
    await mod.rememberManualOverride("k2", "project_b")

    await mod.clearManualOverride("k1")

    expect(await mod.readManualOverride("k1")).toBeNull()
    expect(await mod.readManualOverride("k2")).toMatchObject({ projectId: "project_b" })
  })

  it("ignores empty chat keys", async () => {
    const mod = await loadModule()
    await mod.rememberManualOverride("", "project_a")
    expect(await mod.readManualOverride("")).toBeNull()
  })

  it("bounds the map to the most recent entries", async () => {
    const mod = await loadModule()
    // Write more than the cap (60) with increasing timestamps so the newest win.
    const base = Date.parse("2026-01-01T00:00:00.000Z")
    const nowSpy = vi.spyOn(Date.prototype, "toISOString")
    for (let i = 0; i < 65; i++) {
      nowSpy.mockReturnValueOnce(new Date(base + i * 1000).toISOString())
      await mod.rememberManualOverride(`key_${i}`, `project_${i}`)
    }
    nowSpy.mockRestore()

    // The oldest 5 keys should have been evicted; the newest should remain.
    expect(await mod.readManualOverride("key_64")).toMatchObject({ projectId: "project_64" })
    expect(await mod.readManualOverride("key_0")).toBeNull()
  })
})
