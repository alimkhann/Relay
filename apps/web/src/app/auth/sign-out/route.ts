import { NextResponse } from "next/server"

import { clearLocalSessionCookie } from "@/lib/auth/local-session"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireAuthServer } from "@/lib/auth/server"

async function signOutResponse(request: Request) {
  const url = new URL(request.url)

  if (getAuthProvider() === "local") {
    await clearLocalSessionCookie()
    return NextResponse.redirect(new URL("/get-started", url), { status: 303 })
  }

  const authHandler = requireAuthServer().handler()
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

  const response = NextResponse.redirect(new URL("/get-started", url), { status: 303 })
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
