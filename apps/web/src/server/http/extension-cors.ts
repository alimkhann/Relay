import { NextResponse } from "next/server"

const EXTENSION_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
const EXTENSION_ALLOWED_HEADERS = "authorization, content-type, x-relay-flow-id"
const EXTENSION_EXPOSED_HEADERS = "x-relay-request-id"

export function isExtensionOrigin(origin: string | null | undefined) {
  if (!origin) {
    return false
  }

  return origin.startsWith("chrome-extension://")
}

export function applyExtensionCorsHeaders(response: Response, origin: string | null | undefined) {
  if (!isExtensionOrigin(origin)) {
    return response
  }

  response.headers.set("access-control-allow-origin", origin as string)
  response.headers.set("access-control-allow-methods", EXTENSION_ALLOWED_METHODS)
  response.headers.set("access-control-allow-headers", EXTENSION_ALLOWED_HEADERS)
  response.headers.set("access-control-expose-headers", EXTENSION_EXPOSED_HEADERS)
  response.headers.set("access-control-max-age", "600")
  response.headers.set("vary", "Origin")

  return response
}

export function buildExtensionPreflightResponse(origin: string | null | undefined) {
  return applyExtensionCorsHeaders(new NextResponse(null, { status: 204 }), origin)
}
