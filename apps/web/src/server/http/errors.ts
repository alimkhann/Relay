export class BadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BadRequestError"
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ForbiddenError"
  }
}

export class TooManyRequestsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TooManyRequestsError"
  }
}
