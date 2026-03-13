import { NextResponse, type NextRequest } from "next/server"

import { getAuthServer } from "@/lib/auth/server"
import { buildSignInHref } from "@/server/policies/viewer"

export default function proxy(request: NextRequest) {
  const auth = getAuthServer()

  if (!auth) {
    return NextResponse.next()
  }

  const loginUrl =
    request.nextUrl.pathname === "/get-started"
      ? buildSignInHref("/dashboard", { intent: "sign-up" })
      : "/sign-in"

  return auth.middleware({
    loginUrl
  })(request)
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*", "/settings/:path*", "/get-started"]
}
