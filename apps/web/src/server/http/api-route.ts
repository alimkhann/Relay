import { NextResponse } from "next/server"

import { isAuthRequiredError } from "@/server/policies/viewer"

export function withApiAuth<TArgs extends [Request, ...unknown[]]>(handler: (...args: TArgs) => Promise<Response>) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (error) {
      if (isAuthRequiredError(error)) {
        return NextResponse.json({ error: "Authentication is required." }, { status: 401 })
      }

      throw error
    }
  }
}
