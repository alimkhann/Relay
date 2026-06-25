import { createServiceRepositoryBundle } from "@relay/db"

const SESSION_TOKEN_COOKIE_NAME = "__Secure-neon-auth.session_token"

type AuthHandlerWithAccounts = {
  GET: (
    request: Request,
    context: { params: Promise<{ path: string[] }> },
  ) => Promise<Response>
}

function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=")
    if (rawKey === name) return rawValue.join("=")
  }
  return null
}

function readRawSessionToken(sessionTokenCookie: string) {
  const signatureStart = sessionTokenCookie.lastIndexOf(".")
  if (signatureStart < 1) return sessionTokenCookie

  const signature = sessionTokenCookie.slice(signatureStart + 1)
  return signature.length === 44 && signature.endsWith("=")
    ? sessionTokenCookie.slice(0, signatureStart)
    : sessionTokenCookie
}

async function currentDatabaseSessionUsesGoogle(request: Request) {
  const sessionTokenCookie = readCookieValue(request.headers.get("cookie"), SESSION_TOKEN_COOKIE_NAME)
  if (!sessionTokenCookie) return false

  const repositories = createServiceRepositoryBundle()
  const rows = await repositories.provider.query<{ exists: boolean }>(
    `select exists (
       select 1
         from neon_auth.session s
         join neon_auth.account a on a."userId" = s."userId"
        where s.token = $1
          and s."expiresAt" > now()
          and a."providerId" = 'google'
      ) as exists`,
    [readRawSessionToken(sessionTokenCookie)]
  )

  return rows[0]?.exists === true
}

function getAccountsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== "object") {
    return []
  }

  const record = payload as Record<string, unknown>
  if (Array.isArray(record.accounts)) {
    return record.accounts
  }
  if (Array.isArray(record.data)) {
    return record.data
  }
  return []
}

export function hasGoogleAccount(payload: unknown) {
  return getAccountsFromPayload(payload).some((account) => {
    if (!account || typeof account !== "object") {
      return false
    }

    const record = account as Record<string, unknown>
    return record.providerId === "google" || record.provider === "google"
  })
}

export async function currentSessionUsesGoogle(
  authHandler: AuthHandlerWithAccounts,
  request: Request,
  url: URL,
) {
  try {
    const accountsRequest = new Request(new URL("/api/auth/list-accounts", url.origin), {
      method: "GET",
      headers: {
        Origin: url.origin,
        Cookie: request.headers.get("cookie") ?? "",
      },
    })

    const accountsResponse = await authHandler.GET(accountsRequest, {
      params: Promise.resolve({ path: ["list-accounts"] }),
    })

    if (!accountsResponse.ok) {
      return await currentDatabaseSessionUsesGoogle(request)
    }

    return hasGoogleAccount(await accountsResponse.json())
  } catch {
    return await currentDatabaseSessionUsesGoogle(request)
  }
}
