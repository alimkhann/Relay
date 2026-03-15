import { NextResponse, type NextRequest } from "next/server"

import { getAuthServer } from "@/lib/auth/server"
import { buildExtensionPreflightResponse, isExtensionOrigin } from "@/server/http/extension-cors"

export default function middleware(request: NextRequest) {
  // Let extension API routes through without session auth — they use
  // their own Bearer-token / Google-token authentication.
  if (request.nextUrl.pathname.startsWith("/api/extension/")) {
    return NextResponse.next()
  }

  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    request.method === "OPTIONS" &&
    isExtensionOrigin(request.headers.get("origin"))
  ) {
    return buildExtensionPreflightResponse(request.headers.get("origin"))
  }

  const auth = getAuthServer()

  if (!auth) {
    return NextResponse.next()
  }

  return auth.middleware({
    loginUrl: "/sign-in"
  })(request)
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*", "/projects/:path*", "/settings/:path*"]
}
