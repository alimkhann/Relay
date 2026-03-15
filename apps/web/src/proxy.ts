import { NextResponse, type NextRequest } from "next/server"

import { getAuthServer } from "@/lib/auth/server"
import { buildExtensionPreflightResponse, isExtensionOrigin } from "@/server/http/extension-cors"

export default function proxy(request: NextRequest) {
  // API routes handle their own auth via withApiAuth / resolveViewer(),
  // which returns proper 401 JSON responses. The Neon Auth middleware must
  // NOT intercept API routes — it would redirect to /sign-in (HTML), causing
  // redirect loops for dashboard fetches and unparseable HTML for extension
  // requests that carry Bearer tokens instead of session cookies.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    // Still handle CORS preflight for extension origins
    if (
      request.method === "OPTIONS" &&
      isExtensionOrigin(request.headers.get("origin"))
    ) {
      return buildExtensionPreflightResponse(request.headers.get("origin"))
    }
    return NextResponse.next()
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
