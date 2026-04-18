import { NextResponse, type NextRequest } from "next/server"

import { getAuthServer } from "@/lib/auth/server"
import { buildExtensionPreflightResponse, isExtensionOrigin } from "@/server/http/extension-cors"

const MARKDOWN_ENABLED_PATHS = [
  /^\/$/,
  /^\/machine$/,
  /^\/docs$/,
  /^\/docs\/[^/]+$/,
  /^\/get-started$/,
  /^\/privacy$/,
  /^\/terms$/,
]

function wantsMarkdown(request: NextRequest) {
  return request.method !== "OPTIONS" && Boolean(request.headers.get("accept")?.includes("text/markdown"))
}

function supportsMarkdownPath(pathname: string) {
  return MARKDOWN_ENABLED_PATHS.some((pattern) => pattern.test(pathname))
}

function isProtectedPath(pathname: string) {
  return pathname.startsWith("/dashboard/")
    || pathname === "/dashboard"
    || pathname.startsWith("/projects/")
    || pathname === "/settings"
    || pathname.startsWith("/settings/")
}

export default function middleware(request: NextRequest) {
  if ((request.method === "GET" || request.method === "HEAD") && wantsMarkdown(request) && supportsMarkdownPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/_relay/markdown"
    url.searchParams.set("pathname", request.nextUrl.pathname)
    return NextResponse.rewrite(url)
  }

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

  if (!isProtectedPath(request.nextUrl.pathname) || !auth) {
    return NextResponse.next()
  }

  return auth.middleware({
    loginUrl: "/sign-in"
  })(request)
}

export const config = {
  matcher: [
    "/",
    "/machine",
    "/docs",
    "/docs/:path*",
    "/get-started",
    "/privacy",
    "/terms",
    "/dashboard/:path*",
    "/dashboard",
    "/projects/:path*",
    "/settings/:path*",
    "/settings",
    "/api/:path*",
  ]
}
