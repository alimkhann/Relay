import { NextResponse } from "next/server"

import { logServerEvent } from "@/server/logging/logger"
import { getRequestContext, withRequestContext } from "@/server/logging/request-context"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireAuthServer } from "@/lib/auth/server"

async function handleAuthMethod(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return withRequestContext(request, async () => {
    if (getAuthProvider() === "local") {
      return NextResponse.json(
        { error: "Local auth does not use the Neon auth route." },
        { status: 404 }
      )
    }

    try {
      const response = await requireAuthServer().handler()[method](request, context)
      const requestId = getRequestContext()?.requestId
      if (requestId) {
        response.headers.set("x-relay-request-id", requestId)
      }

      await logServerEvent({
        level: response.ok ? "info" : "warn",
        surface: "web-api",
        area: "auth",
        event: "web_auth.route_response",
        message: `${method} ${new URL(request.url).pathname} -> ${response.status}`,
        context: {
          method,
          path: new URL(request.url).pathname,
          status: response.status
        }
      })

      return response
    } catch (error) {
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "auth",
        event: "web_auth.route_failed",
        message: `${method} ${new URL(request.url).pathname} failed`,
        error
      })
      throw error
    }
  })
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleAuthMethod("GET", request, context)
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleAuthMethod("POST", request, context)
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleAuthMethod("PUT", request, context)
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleAuthMethod("PATCH", request, context)
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleAuthMethod("DELETE", request, context)
}
