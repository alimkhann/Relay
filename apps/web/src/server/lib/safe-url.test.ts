import { describe, expect, it } from "vitest"

import {
  assertPublicHttpsUrl,
  isPrivateAddress,
  normalizePublicHttpsUrl,
  readCappedBody,
} from "./safe-url"

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }]

describe("isPrivateAddress", () => {
  it("flags loopback, link-local, ULA, CGNAT, and v4-mapped v6", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true)
    expect(isPrivateAddress("169.254.169.254")).toBe(true)
    expect(isPrivateAddress("10.1.2.3")).toBe(true)
    expect(isPrivateAddress("100.64.1.1")).toBe(true)
    expect(isPrivateAddress("::1")).toBe(true)
    expect(isPrivateAddress("fd00::1")).toBe(true)
    expect(isPrivateAddress("fe80::1")).toBe(true)
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true)
    expect(isPrivateAddress("93.184.216.34")).toBe(false)
    expect(isPrivateAddress("2606:2800:220:1::1")).toBe(false)
  })

  it("treats non-IP strings as unsafe", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true)
  })
})

describe("normalizePublicHttpsUrl", () => {
  it("normalizes host case and strips hash/trailing slash", () => {
    expect(normalizePublicHttpsUrl("https://Example.COM/docs/#x").toString()).toBe(
      "https://example.com/docs",
    )
  })

  it("rejects http, credentials, and literal private targets", () => {
    expect(() => normalizePublicHttpsUrl("http://example.com")).toThrow(/https/i)
    expect(() => normalizePublicHttpsUrl("https://user:pw@example.com")).toThrow(/credentials/i)
    expect(() => normalizePublicHttpsUrl("https://127.0.0.1/x")).toThrow(/public URL/i)
    expect(() => normalizePublicHttpsUrl("https://[::1]/x")).toThrow(/public URL/i)
    expect(() => normalizePublicHttpsUrl("https://localhost/x")).toThrow(/public URL/i)
  })
})

describe("assertPublicHttpsUrl", () => {
  it("passes a public host that resolves to a public IP", async () => {
    const url = await assertPublicHttpsUrl("https://example.com/docs", { lookup: publicLookup })
    expect(url.toString()).toBe("https://example.com/docs")
  })

  it("rejects a public host that resolves to a private/metadata IP", async () => {
    await expect(
      assertPublicHttpsUrl("https://rebind.example.com/x", {
        lookup: async () => [{ address: "169.254.169.254", family: 4 }],
      }),
    ).rejects.toThrow(/public URL/i)
  })

  it("rejects decimal/hex IP literals normalized by getaddrinfo", async () => {
    const toLoopback = async () => [{ address: "127.0.0.1", family: 4 }]
    await expect(assertPublicHttpsUrl("https://2130706433/", { lookup: toLoopback })).rejects.toThrow(
      /public URL/i,
    )
    await expect(assertPublicHttpsUrl("https://0x7f000001/", { lookup: toLoopback })).rejects.toThrow(
      /public URL/i,
    )
  })

  it("rejects when every resolved address must be public (mixed result)", async () => {
    await expect(
      assertPublicHttpsUrl("https://example.com/x", {
        lookup: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.5", family: 4 },
        ],
      }),
    ).rejects.toThrow(/public URL/i)
  })

  it("fails closed when DNS resolution throws", async () => {
    await expect(
      assertPublicHttpsUrl("https://example.com/x", {
        lookup: async () => {
          throw new Error("ENOTFOUND")
        },
      }),
    ).rejects.toThrow(/could not be resolved/i)
  })
})

describe("readCappedBody", () => {
  it("returns the full body under the cap", async () => {
    const body = await readCappedBody(new Response("hello"), 100)
    expect(body.toString("utf8")).toBe("hello")
  })

  it("throws once the body exceeds the cap", async () => {
    await expect(readCappedBody(new Response("0123456789"), 4)).rejects.toThrow(/size limit/i)
  })
})
