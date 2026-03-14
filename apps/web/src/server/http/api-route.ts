import { NextResponse } from "next/server"

import { logServerEvent } from "@/server/logging/logger"
import { getRequestContext, withRequestContext } from "@/server/logging/request-context"
import { BadRequestError } from "@/server/http/errors"
import { applyExtensionCorsHeaders } from "@/server/http/extension-cors"
import { isAuthRequiredError } from "@/server/policies/viewer"

interface ApiRouteOptions {
  logSuccess?: boolean
}

interface ValidationIssue {
  path?: Array<string | number>
  message?: string
}

function isValidationError(error: unknown): error is { issues: ValidationIssue[] } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "issues" in error &&
      Array.isArray((error as { issues?: unknown }).issues)
  )
}

function finalizeResponse(request: Request, response: Response) {
  const requestContext = getRequestContext()

  if (requestContext) {
    response.headers.set("x-relay-request-id", requestContext.requestId)
  }

  return applyExtensionCorsHeaders(response, request.headers.get("origin"))
}

export function withApiRoute<TArgs extends [Request, ...unknown[]]>(
  handler: (...args: TArgs) => Promise<Response>,
  options: ApiRouteOptions = {}
) {
  return async (...args: TArgs): Promise<Response> =>
    withRequestContext(args[0], async () => {
      const request = args[0]
      const requestContext = getRequestContext()
      const startedAt = Date.now()

      try {
        const response = finalizeResponse(request, await handler(...args))

        if (options.logSuccess !== false) {
          await logServerEvent({
            level: response.ok ? "info" : "warn",
            surface: "web-api",
            area: "request",
            event: "api.response",
            message: `${request.method} ${requestContext?.path ?? new URL(request.url).pathname} -> ${response.status}`,
            context: {
              method: request.method,
              path: requestContext?.path ?? new URL(request.url).pathname,
              status: response.status,
              durationMs: Date.now() - startedAt
            }
          })
        }

        return response
      } catch (error) {
        if (isAuthRequiredError(error)) {
          const response = finalizeResponse(
            request,
            NextResponse.json({ error: "Authentication is required." }, { status: 401 })
          )

          await logServerEvent({
            level: "warn",
            surface: "web-api",
            area: "auth",
            event: "api.unauthorized",
            message: `${request.method} ${requestContext?.path ?? new URL(request.url).pathname} -> 401`,
            context: {
              method: request.method,
              path: requestContext?.path ?? new URL(request.url).pathname,
              durationMs: Date.now() - startedAt
            }
          })

          return response
        }

        if (isValidationError(error)) {
          await logServerEvent({
            level: "warn",
            surface: "web-api",
            area: "validation",
            event: "api.validation_failed",
            message: `${request.method} ${requestContext?.path ?? new URL(request.url).pathname} failed validation`,
            context: {
              method: request.method,
              path: requestContext?.path ?? new URL(request.url).pathname,
              issues: error.issues.map((issue) => ({
                path: Array.isArray(issue.path) ? issue.path.join(".") : "",
                message: issue.message ?? "Invalid value"
              })),
              durationMs: Date.now() - startedAt
            }
          })

          return finalizeResponse(
            request,
            NextResponse.json(
              { error: error.issues[0]?.message ?? "Request validation failed." },
              { status: 400 }
            )
          )
        }

        if (error instanceof BadRequestError) {
          await logServerEvent({
            level: "warn",
            surface: "web-api",
            area: "validation",
            event: "api.bad_request",
            message: error.message,
            context: {
              method: request.method,
              path: requestContext?.path ?? new URL(request.url).pathname,
              durationMs: Date.now() - startedAt
            }
          })

          return finalizeResponse(
            request,
            NextResponse.json(
              { error: error.message },
              { status: 400 }
            )
          )
        }

        await logServerEvent({
          level: "error",
          surface: "web-api",
          area: "request",
          event: "api.exception",
          message: `${request.method} ${requestContext?.path ?? new URL(request.url).pathname} failed`,
          context: {
            method: request.method,
            path: requestContext?.path ?? new URL(request.url).pathname,
            durationMs: Date.now() - startedAt
          },
          error
        })

        return finalizeResponse(
          request,
          NextResponse.json({ error: "Internal server error." }, { status: 500 })
        )
      }
    })
}

export function withApiAuth<TArgs extends [Request, ...unknown[]]>(handler: (...args: TArgs) => Promise<Response>) {
  return withApiRoute(handler)
}
