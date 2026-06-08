import { describe, expect, it, vi } from "vitest"

import { MemoryPipelineJobRepository } from "./memory-pipeline-job-repository"

const JOB_ROW = {
  id: "job-1",
  job_type: "enrich_memory_item",
  dedupe_key: "memory-item:memory-1",
  user_id: "user-1",
  project_id: "project-1",
  memory_item_id: "memory-1",
  payload: {},
  status: "pending",
  run_after: new Date().toISOString(),
  attempts: 0,
  locked_at: null,
  locked_by: null,
  last_error: null,
  completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe("MemoryPipelineJobRepository", () => {
  it("coalesces active duplicate jobs by dedupe key", async () => {
    const provider = { query: vi.fn(async (_sql: string, _values?: unknown[]) => [JOB_ROW]) }
    const repo = new MemoryPipelineJobRepository(provider as never)

    await repo.enqueue({
      jobType: "enrich_memory_item",
      dedupeKey: "memory-item:memory-1",
      memoryItemId: "memory-1",
    })

    const sql = String(provider.query.mock.calls[0]?.[0])
    expect(sql).toContain("on conflict (dedupe_key) where status in ('pending','running','failed')")
    expect(sql).toContain("else least")
    expect(sql).toContain("then greatest")
    expect(sql).toContain("when memory_pipeline_jobs.status = 'failed' then 'pending'")
  })

  it("claims jobs atomically so concurrent drains cannot double-process them", async () => {
    const provider = { query: vi.fn(async (_sql: string, _values?: unknown[]) => [JOB_ROW]) }
    const repo = new MemoryPipelineJobRepository(provider as never)

    await repo.claimDue({ limit: 5, lockedBy: "worker-1" })

    const sql = String(provider.query.mock.calls[0]?.[0])
    expect(sql).toContain("for update skip locked")
    expect(sql).toContain("set status = 'running'")
  })
})
