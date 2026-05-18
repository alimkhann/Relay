import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AssistantStreamEvent, SendAssistantMessageInput } from "@relay/shared"

import type { Viewer } from "@/server/policies/viewer"

import type * as GeminiService from "./gemini-service"
import type * as AssistantTools from "./assistant-tools"

const mocks = vi.hoisted(() => ({
  createRepositoryBundle: vi.fn(),
  executeAssistantTool: vi.fn(),
  runGeminiAgentStep: vi.fn(),
  logServerEvent: vi.fn()
}))

vi.mock("@relay/db", () => ({
  createRepositoryBundle: mocks.createRepositoryBundle
}))

vi.mock("@/app/api/mcp/stream/relay-http-mcp-client", () => ({
  RelayHttpMcpClient: class {}
}))

vi.mock("@/server/logging/logger", () => ({
  logServerEvent: mocks.logServerEvent
}))

vi.mock("./gemini-service", async (importActual) => {
  const actual = await importActual<typeof GeminiService>()
  return { ...actual, runGeminiAgentStep: mocks.runGeminiAgentStep }
})

vi.mock("./assistant-tools", async (importActual) => {
  const actual = await importActual<typeof AssistantTools>()
  return { ...actual, executeAssistantTool: mocks.executeAssistantTool }
})

import { runAssistantTurn } from "./assistant-agent-service"

const viewer = { userId: "u1" } as unknown as Viewer

function repoBundle() {
  let n = 0
  return {
    assistantChats: {
      getById: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "c1", userId: "u1", projectId: null, surface: "dashboard", title: "t" })),
      touch: vi.fn(async () => {})
    },
    assistantMessages: {
      listByChat: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: `m${++n}` }))
    }
  }
}

async function collect(input: SendAssistantMessageInput): Promise<AssistantStreamEvent[]> {
  const events: AssistantStreamEvent[] = []
  for await (const e of runAssistantTurn(viewer, input, { plan: "pro", maxSteps: 3 })) {
    events.push(e)
  }
  return events
}

describe("runAssistantTurn confirmation guard (A2 regression)", () => {
  beforeEach(() => {
    mocks.createRepositoryBundle.mockReset().mockReturnValue(repoBundle())
    mocks.executeAssistantTool.mockReset()
    mocks.runGeminiAgentStep.mockReset()
  })

  it("a NEW destructive call during a confirmed continuation still requires confirmation", async () => {
    mocks.runGeminiAgentStep.mockResolvedValueOnce({
      text: "",
      functionCalls: [{ name: "manage_memory", args: { action: "delete", memoryId: ["x9"] } }],
      finishReason: null,
      tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
    })

    const events = await collect({
      message: "also delete x9",
      surface: "dashboard",
      confirmActionId: "already-confirmed-something-else",
      parentId: null,
      projectId: null
    } as unknown as SendAssistantMessageInput)

    const pending = events.find((e) => e.type === "pending_action")
    expect(pending).toBeTruthy()
    expect(pending && pending.type === "pending_action" && pending.action.tool).toBe("manage_memory")
    // The unconfirmed destructive call must NOT have executed.
    expect(mocks.executeAssistantTool).not.toHaveBeenCalled()
  })

  it("non-destructive tools still run without a confirmation prompt", async () => {
    mocks.runGeminiAgentStep
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [{ name: "list_projects", args: {} }],
        finishReason: null,
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
      })
      .mockResolvedValueOnce({
        text: "Here are your projects.",
        functionCalls: [],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 3, outputTokens: 3, totalTokens: 6 }
      })
    mocks.executeAssistantTool.mockResolvedValue({ modelResponse: { result: "ok" }, actionResult: null })

    const events = await collect({
      message: "list my projects",
      surface: "dashboard",
      parentId: null,
      projectId: null
    } as unknown as SendAssistantMessageInput)

    expect(events.some((e) => e.type === "pending_action")).toBe(false)
    expect(mocks.executeAssistantTool).toHaveBeenCalledTimes(1)
    expect(events.some((e) => e.type === "done")).toBe(true)
  })
})
