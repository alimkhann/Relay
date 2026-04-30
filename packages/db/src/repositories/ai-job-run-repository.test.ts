import { describe, expect, it } from "vitest"

import type { DatabaseProvider, DatabaseRow } from "../store/provider"
import { AiJobRunRepository } from "./ai-job-run-repository"

interface CapturedCall {
  text: string
  values: unknown[]
}

function makeJobRow(status = "running"): DatabaseRow {
  return {
    id: "job-1",
    project_id: "project-1",
    session_id: "session-1",
    job_kind: "session_digest",
    status,
    input_payload: {},
    output_payload: {},
    primary_model: "gemini",
    actual_model: null,
    fallback_used: false,
    token_usage: {},
    error_class: null,
    error_message: null,
    attempts: 2,
    started_at: "2026-04-01T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
  }
}

function makeFakeProvider(responseRows: DatabaseRow[] = []): {
  provider: DatabaseProvider
  calls: CapturedCall[]
} {
  const calls: CapturedCall[] = []
  const provider: DatabaseProvider = {
    mode: "local",
    async query<T extends DatabaseRow = DatabaseRow>(text: string, values: unknown[] = []): Promise<T[]> {
      calls.push({ text, values })
      return responseRows as T[]
    },
    async transaction<T>(callback: (provider: DatabaseProvider) => Promise<T>): Promise<T> {
      return callback(provider)
    },
  }
  return { provider, calls }
}

describe("AiJobRunRepository", () => {
  it("claims runnable jobs with a status guard", async () => {
    const { provider, calls } = makeFakeProvider([makeJobRow()])
    const repo = new AiJobRunRepository(provider)

    const result = await repo.markRunningIfRunnable("job-1", 2, ["pending", "timed_out"])

    expect(result?.id).toBe("job-1")
    expect(calls[0]!.text).toContain("and status = any($3::text[])")
    expect(calls[0]!.values).toEqual(["job-1", 2, ["pending", "timed_out"]])
  })

  it("returns null when another worker already claimed the job", async () => {
    const { provider } = makeFakeProvider([])
    const repo = new AiJobRunRepository(provider)

    await expect(repo.markRunningIfRunnable("job-1", 2, ["pending"])).resolves.toBeNull()
  })
})
