import { NextResponse, type NextRequest } from "next/server"

import { getAuthServer } from "@/lib/auth/server"
import { buildExtensionPreflightResponse, isExtensionOrigin } from "@/server/http/extension-cors"

const SESSION_TOKEN_COOKIE_NAME = "__Secure-neon-auth.session_token"

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

export default async function middleware(request: NextRequest) {
  if ((request.method === "GET" || request.method === "HEAD") && wantsMarkdown(request) && supportsMarkdownPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/agent-markdown"
    url.searchParams.set("pathname", request.nextUrl.pathname)
    return NextResponse.rewrite(url)
  }

  if (
    request.method === "OPTIONS" &&
    request.nextUrl.pathname.startsWith("/api/") &&
    isExtensionOrigin(request.headers.get("origin"))
  ) {
    return buildExtensionPreflightResponse(request.headers.get("origin"))
  }

  const auth = getAuthServer()

  if (!isProtectedPath(request.nextUrl.pathname) || !auth) {
    return NextResponse.next()
  }

  if (request.cookies?.has(SESSION_TOKEN_COOKIE_NAME) || request.headers.get("cookie")?.includes(`${SESSION_TOKEN_COOKIE_NAME}=`)) {
    return NextResponse.next()
  }

  try {
    return await auth.middleware({
      loginUrl: "/sign-in"
    })(request)
  } catch {
    return NextResponse.next()
  }
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
    {
      source: "/api/:path*",
      has: [
        { type: "header", key: "origin", value: "chrome-extension://.*" },
        { type: "header", key: "access-control-request-method" },
      ],
    },
  ]
}
