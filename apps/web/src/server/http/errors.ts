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

  constructor(message: string, meta?: {
    retryAfterSeconds?: number
    upgradeUrl?: string
    plan?: string
    limit?: number
    remaining?: number
  }) {
    super(message)
    this.name = "TooManyRequestsError"
    if (meta) {
      this.retryAfterSeconds = meta.retryAfterSeconds
      this.upgradeUrl = meta.upgradeUrl
      this.plan = meta.plan
      this.limit = meta.limit
      this.remaining = meta.remaining
    }
  }
}
