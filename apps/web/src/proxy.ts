import { NextResponse, type NextRequest } from "next/server"

import { getAuthServer } from "@/lib/auth/server"

export default function proxy(request: NextRequest) {
  const auth = getAuthServer()

  if (!auth) {
    return NextResponse.next()
  }

  return auth.middleware({
    loginUrl: "/sign-in"
  })(request)
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*", "/settings/:path*"]
}
