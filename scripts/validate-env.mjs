const authProvider = process.env.AUTH_PROVIDER === "local" ? "local" : "neon"

const required = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "NEXT_PUBLIC_RELAY_APP_URL",
  "RELAY_INTERNAL_API_SECRET"
]

if (authProvider === "neon") {
  required.push("NEON_AUTH_BASE_URL", "NEXT_PUBLIC_NEON_AUTH_URL", "NEON_AUTH_COOKIE_SECRET")
} else {
  required.push("LOCAL_AUTH_SESSION_SECRET")
}

const missing = required.filter((key) => !process.env[key]?.trim())

if (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_RELAY_APP_URL) {
  const left = process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/+$/, "")
  const right = process.env.NEXT_PUBLIC_RELAY_APP_URL.trim().replace(/\/+$/, "")

  if (left !== right) {
    console.error("NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_RELAY_APP_URL must match when both are set.")
    process.exit(1)
  }
}

if (!process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_RELAY_APP_URL) {
  console.warn("Warning: NEXT_PUBLIC_APP_URL is unset. Some legacy auth/token flows still read it.")
}

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`)
  process.exit(1)
}

console.log(`Environment validation passed for ${authProvider} auth.`)
