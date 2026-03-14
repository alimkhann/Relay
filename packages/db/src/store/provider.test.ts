import { describe, expect, it } from "vitest"

import {
  isLocalConnectionString,
  resolveDatabaseConfig,
} from "./provider"

describe("resolveDatabaseConfig", () => {
  it("prefers LOCAL_DATABASE_URL when local auth is enabled", () => {
    expect(
      resolveDatabaseConfig({
        AUTH_PROVIDER: "local",
        DATABASE_URL: "postgresql://remote.example.com/neondb",
        LOCAL_DATABASE_URL: "postgresql://relay:relay@127.0.0.1:54329/relay_local",
      })
    ).toEqual({
      connectionString: "postgresql://relay:relay@127.0.0.1:54329/relay_local",
      mode: "local",
    })
  })

  it("falls back to local mode for localhost connections", () => {
    expect(
      resolveDatabaseConfig({
        DATABASE_URL: "postgresql://relay:relay@localhost:5432/relay_local",
      })
    ).toEqual({
      connectionString: "postgresql://relay:relay@localhost:5432/relay_local",
      mode: "local",
    })
  })

  it("keeps neon mode for non-local hosts", () => {
    expect(
      resolveDatabaseConfig({
        DATABASE_URL: "postgresql://user:pass@ep-broad-glitter.ag5sv14w.neon.tech/neondb",
      })
    ).toEqual({
      connectionString: "postgresql://user:pass@ep-broad-glitter.ag5sv14w.neon.tech/neondb",
      mode: "neon",
    })
  })

  it("fails fast when local auth is enabled without a local database url", () => {
    expect(() =>
      resolveDatabaseConfig({
        AUTH_PROVIDER: "local",
        DATABASE_URL: "postgresql://user:pass@ep-broad-glitter.ag5sv14w.neon.tech/neondb",
      })
    ).toThrow(
      "LOCAL_DATABASE_URL is required when AUTH_PROVIDER=local unless DATABASE_URL already points to localhost."
    )
  })
})

describe("isLocalConnectionString", () => {
  it("recognizes loopback hosts", () => {
    expect(isLocalConnectionString("postgresql://relay:relay@127.0.0.1:54329/relay_local")).toBe(true)
    expect(isLocalConnectionString("postgresql://relay:relay@localhost:5432/relay_local")).toBe(true)
  })

  it("rejects non-local hosts", () => {
    expect(isLocalConnectionString("postgresql://user:pass@ep-broad-glitter.ag5sv14w.neon.tech/neondb")).toBe(false)
  })
})
