import { describe, expect, it } from "vitest"

import {
  applyExtensionCorsHeaders,
  buildExtensionPreflightResponse,
  isExtensionOrigin
} from "./extension-cors"

describe("extension cors helpers", () => {
  it("recognizes chrome extension origins", () => {
    expect(isExtensionOrigin("chrome-extension://capboopgpcmoakcilbjlbepmiobhdehj")).toBe(true)
    expect(isExtensionOrigin("http://localhost:3000")).toBe(false)
  })

  it("applies cors headers for extension origins", () => {
    const response = applyExtensionCorsHeaders(new Response(null, { status: 200 }), "chrome-extension://capboopgpcmoakcilbjlbepmiobhdehj")

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://capboopgpcmoakcilbjlbepmiobhdehj"
    )
    expect(response.headers.get("access-control-allow-methods")).toContain("OPTIONS")
  })

  it("builds a preflight response", () => {
    const response = buildExtensionPreflightResponse("chrome-extension://capboopgpcmoakcilbjlbepmiobhdehj")

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://capboopgpcmoakcilbjlbepmiobhdehj"
    )
  })
})
