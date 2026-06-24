import { NextResponse } from "next/server"

import { clearLocalSessionCookieFromResponse } from "@/lib/auth/local-session"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireAuthServer } from "@/lib/auth/server"

const GOOGLE_LOGOUT_URL = "https://accounts.google.com/Logout"
const GOOGLE_LOGOUT_RETURN_URL = "https://www.google.com/"

function getGoogleLogoutUrl() {
  const logoutUrl = new URL(GOOGLE_LOGOUT_URL)
  logoutUrl.searchParams.set("continue", GOOGLE_LOGOUT_RETURN_URL)
  return logoutUrl
}

function wantsJsonResponse(request: Request) {
  return request.headers.get("accept")?.includes("application/json") ?? false
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

function hasGoogleAccount(payload: unknown) {
  return getAccountsFromPayload(payload).some((account) => {
    if (!account || typeof account !== "object") {
      return false
    }

    const record = account as Record<string, unknown>
    return record.providerId === "google" || record.provider === "google"
  })
}

async function currentSessionUsesGoogle(
  authHandler: ReturnType<ReturnType<typeof requireAuthServer>["handler"]>,
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
      return false
    }

    return hasGoogleAccount(await accountsResponse.json())
  } catch {
    return false
  }
}

async function signOutResponse(request: Request) {
  const url = new URL(request.url)
  const returnUrl = new URL("/get-started", url)
  const wantsJson = wantsJsonResponse(request)

  if (getAuthProvider() === "local") {
    const response = wantsJson
      ? NextResponse.json({ redirectTo: returnUrl.pathname })
      : NextResponse.redirect(returnUrl, { status: 303 })
    return clearLocalSessionCookieFromResponse(response)
  }

  const authHandler = requireAuthServer().handler()
  const shouldSignOutOfGoogle = await currentSessionUsesGoogle(authHandler, request, url)
  const innerRequest = new Request(new URL("/api/auth/sign-out", url.origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: url.origin,
      Cookie: request.headers.get("cookie") ?? "",
    },
    body: "{}",
  })

  const authResponse = await authHandler.POST(innerRequest, {
    params: Promise.resolve({ path: ["sign-out"] }),
  })

  const response = wantsJson
    ? NextResponse.json({
        redirectTo: returnUrl.pathname,
        googleLogoutUrl: shouldSignOutOfGoogle ? getGoogleLogoutUrl().toString() : undefined,
      })
    : NextResponse.redirect(returnUrl, { status: 303 })
  for (const cookieHeader of authResponse.headers.getSetCookie()) {
    response.headers.append("Set-Cookie", cookieHeader)
  }
  return response
}

export async function GET(request: Request) {
  return signOutResponse(request)
}

export async function POST(request: Request) {
  return signOutResponse(request)
}
