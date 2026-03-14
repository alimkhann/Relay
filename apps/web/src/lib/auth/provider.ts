export type AuthProvider = "neon" | "local"

export function getAuthProvider(): AuthProvider {
  return process.env.AUTH_PROVIDER === "local" ? "local" : "neon"
}

export function isLocalAuthProvider() {
  return getAuthProvider() === "local"
}

export function isNeonAuthProvider() {
  return getAuthProvider() === "neon"
}
