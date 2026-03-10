import { createNeonAuth } from "@neondatabase/auth/next/server"

let authInstance: ReturnType<typeof createNeonAuth> | null | undefined

export function getAuthServer() {
  if (authInstance !== undefined) {
    return authInstance
  }

  const baseUrl = process.env.NEON_AUTH_BASE_URL
  const secret = process.env.NEON_AUTH_COOKIE_SECRET

  if (!baseUrl || !secret) {
    authInstance = null
    return authInstance
  }

  authInstance = createNeonAuth({
    baseUrl,
    cookies: {
      secret
    }
  })

  return authInstance
}

export function requireAuthServer() {
  const auth = getAuthServer()

  if (!auth) {
    throw new Error("NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required.")
  }

  return auth
}
