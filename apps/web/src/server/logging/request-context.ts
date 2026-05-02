import { AsyncLocalStorage } from "node:async_hooks"

import { createFlowId } from "@relay/shared"

export interface RequestContext {
  requestId: string
  flowId: string | null
  method: string
  path: string
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>()

export function getRequestContext() {
  return requestContextStorage.getStore() ?? null
}

export function withRequestContext<T>(request: Request, task: () => Promise<T>) {
  const url = new URL(request.url)
  const context: RequestContext = {
    requestId: request.headers.get("x-relay-request-id")?.trim() || createFlowId("req"),
    flowId: request.headers.get("x-relay-flow-id")?.trim() || null,
    method: request.method,
    path: url.pathname
  }

  return requestContextStorage.run(context, task)
}
