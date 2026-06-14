import { describe, it, expect, vi, beforeEach } from "vitest"
import { RelayClient } from "./client.js"
import { loadConfig, type RelayConfig } from "./config.js"

vi.mock("./config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue(null),
  saveConfig: vi.fn().mockResolvedValue(undefined),
}))

const mockedLoadConfig = vi.mocked(loadConfig)

function createClient(baseUrl = "https://relay.test") {
  return new RelayClient({ apiBase: baseUrl, token: "relay_test123" })
}

function future(ms: number) {
  return new Date(Date.now() + ms).toISOString()
}

describe("RelayClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockedLoadConfig.mockResolvedValue(null as unknown as RelayConfig)
  })

  it("sends GET requests with bearer auth", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ projects: [] })
    })
    vi.stubGlobal("fetch", mockFetch)

    const client = createClient()
    await client.get("/api/projects")

    expect(mockFetch).toHaveBeenCalledWith("https://relay.test/api/projects", {
      method: "GET",
      headers: {
        Authorization: "Bearer relay_test123",
        Accept: "application/json"
      },
      body: undefined,
      signal: expect.any(AbortSignal)
    })
  })

  it("sends POST requests with JSON body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ item: { id: "1" } })
    })
    vi.stubGlobal("fetch", mockFetch)

    const client = createClient()
    await client.post("/api/memory", { type: "note", content: "test" })

    expect(mockFetch).toHaveBeenCalledWith("https://relay.test/api/memory", {
      method: "POST",
      headers: {
        Authorization: "Bearer relay_test123",
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ type: "note", content: "test" }),
      signal: expect.any(AbortSignal)
    })
  })

  it("sends PATCH requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ item: { id: "1" } })
    })
    vi.stubGlobal("fetch", mockFetch)

    const client = createClient()
    await client.patch("/api/memory/123", { content: "updated" })

    expect(mockFetch).toHaveBeenCalledWith(
      "https://relay.test/api/memory/123",
      expect.objectContaining({ method: "PATCH" })
    )
  })

  it("sends DELETE requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", mockFetch)

    const client = createClient()
    await client.delete("/api/memory/123")

    expect(mockFetch).toHaveBeenCalledWith("https://relay.test/api/memory/123", {
      method: "DELETE",
      headers: { Authorization: "Bearer relay_test123" }
    })
  })

  it("throws on non-ok response with parsed error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve(JSON.stringify({ error: "Invalid token" }))
    })
    vi.stubGlobal("fetch", mockFetch)

    const client = createClient()
    await expect(client.get("/api/projects")).rejects.toThrow("Invalid token")
  })

  it("strips trailing slashes from base URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    })
    vi.stubGlobal("fetch", mockFetch)

    const client = createClient("https://relay.test///")
    await client.get("/api/projects")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://relay.test/api/projects",
      expect.anything()
    )
  })

  it("does not permanently brick the client when a token refresh hits a transient error", async () => {
    // Access token near expiry → request() triggers a proactive refresh.
    const client = new RelayClient({
      apiBase: "https://relay.test",
      token: "expired_access",
      refreshToken: "rt_1",
      accessTokenExpiresAt: future(30_000),
    })

    let refreshCalls = 0
    const mockFetch = vi.fn((url: string) => {
      if (url.endsWith("/api/mcp/refresh")) {
        refreshCalls++
        // First refresh: transient 503 (must NOT latch refreshFailed).
        if (refreshCalls === 1) {
          return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve("upstream") })
        }
        // Second refresh: succeeds.
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            accessToken: "new_access",
            refreshToken: "rt_2",
            accessExpiresAt: future(3_600_000),
            refreshExpiresAt: future(86_400_000),
            apiBase: "https://relay.test",
          }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    })
    vi.stubGlobal("fetch", mockFetch)

    // First call fails transiently on refresh — but the client stays usable.
    await expect(client.get("/api/projects")).rejects.toThrow(/refresh failed \(503\)/)
    // Second call: refresh recovers, request succeeds. Proves no permanent brick.
    await expect(client.get("/api/projects")).resolves.toEqual({ ok: true })
    expect(refreshCalls).toBe(2)
  })

  it("adopts rotated disk credentials on a 401 instead of failing", async () => {
    // A sibling MCP process rotated the (single-use) token and persisted fresh
    // creds to disk; this token-only client should adopt them and retry.
    mockedLoadConfig.mockResolvedValue({
      apiBase: "https://relay.test",
      token: "fresh_from_disk",
      refreshToken: "rt_disk",
      accessTokenExpiresAt: future(3_600_000),
    })
    const client = new RelayClient({ apiBase: "https://relay.test", token: "stale" })

    const mockFetch = vi.fn((_url: string, init?: { headers?: Record<string, string> }) => {
      const auth = String(init?.headers?.["Authorization"] ?? "")
      if (auth.includes("fresh_from_disk")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("expired"),
      })
    })
    vi.stubGlobal("fetch", mockFetch)

    await expect(client.post("/api/memory", { type: "note" })).resolves.toEqual({ ok: true })
  })
})
