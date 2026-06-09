export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnauthorizedError"
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BadRequestError"
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NotFoundError"
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ForbiddenError"
  }
}

export class TooManyRequestsError extends Error {
  readonly retryAfterSeconds?: number
  readonly upgradeUrl?: string
  readonly plan?: string
  readonly limit?: number
  readonly remaining?: number
  readonly quotaFamily?: "read" | "write" | "assistant"
  readonly quotaWindow?: "day" | "month"
  readonly resetAt?: string
  readonly nextPlan?: "starter" | "pro" | null

  constructor(message: string, meta?: {
    retryAfterSeconds?: number
    upgradeUrl?: string
    plan?: string
    limit?: number
    remaining?: number
    quotaFamily?: "read" | "write" | "assistant"
    quotaWindow?: "day" | "month"
    resetAt?: string
    nextPlan?: "starter" | "pro" | null
  }) {
    super(message)
    this.name = "TooManyRequestsError"
    if (meta) {
      this.retryAfterSeconds = meta.retryAfterSeconds
      this.upgradeUrl = meta.upgradeUrl
      this.plan = meta.plan
      this.limit = meta.limit
      this.remaining = meta.remaining
      this.quotaFamily = meta.quotaFamily
      this.quotaWindow = meta.quotaWindow
      this.resetAt = meta.resetAt
      this.nextPlan = meta.nextPlan
    }
  }
}
