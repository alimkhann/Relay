import { after } from "next/server"

// Runs a task after the HTTP response has been sent. Wrapped so route handlers
// stay testable (mock this module) and so a failing background task can never
// turn into a response-time 500.
export function runAfterResponse(task: () => Promise<void> | void) {
  after(async () => {
    try {
      await task()
    } catch {
      // Background failures are recorded as source status, not surfaced here.
    }
  })
}
