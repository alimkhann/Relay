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

import { GeminiRequestError } from "./gemini-service"
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

async function collect(
  input: SendAssistantMessageInput,
  options: { plan?: "free" | "pro"; maxSteps?: number } = {}
): Promise<AssistantStreamEvent[]> {
  const events: AssistantStreamEvent[] = []
  for await (const e of runAssistantTurn(viewer, input, {
    plan: options.plan ?? "pro",
    maxSteps: options.maxSteps ?? 3
  })) {
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
      groundingUris: [],
      groundingChunks: [],
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
        groundingUris: [],
        groundingChunks: [],
        finishReason: null,
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
      })
      .mockResolvedValueOnce({
        text: "Here are your projects.",
        functionCalls: [],
        groundingUris: [],
        groundingChunks: [],
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

  it("replaying a consumed confirmActionId is an idempotent no-op (no double-run)", async () => {
    const markConsumed = vi.fn(async () => {})
    const pendingMessage = {
      id: "pm1",
      chatId: "c1",
      userId: "u1",
      role: "assistant",
      parentId: null,
      content: "Awaiting confirmation to delete 1 memory item(s).",
      toolName: "pending_action",
      toolPayload: {
        pendingAction: {
          id: "pending-1",
          tool: "manage_memory",
          summary: "delete 1 memory item(s)",
          args: { action: "delete", memoryId: ["m9"] }
        },
        consumed: true
      },
      createdAt: "2026-05-20T00:00:00Z"
    }
    mocks.createRepositoryBundle.mockReset().mockReturnValue({
      assistantChats: {
        getById: vi.fn(async () => ({
          id: "c1",
          userId: "u1",
          projectId: null,
          surface: "dashboard",
          title: "t"
        })),
        create: vi.fn(async () => ({
          id: "c1",
          userId: "u1",
          projectId: null,
          surface: "dashboard",
          title: "t"
        })),
        touch: vi.fn(async () => {})
      },
      assistantMessages: {
        listByChat: vi.fn(async () => [pendingMessage]),
        create: vi.fn(async () => ({ id: "m1" })),
        markToolPayloadConsumed: markConsumed
      }
    })

    const events = await collect({
      message: "go ahead",
      surface: "dashboard",
      chatId: "c1",
      confirmActionId: "pending-1",
      parentId: "pm1",
      projectId: null
    } as unknown as SendAssistantMessageInput)

    expect(mocks.executeAssistantTool).not.toHaveBeenCalled()
    expect(markConsumed).not.toHaveBeenCalled()
    const err = events.find((e) => e.type === "error")
    expect(err && err.type === "error" && err.message).toMatch(/already been confirmed/i)
  })
})

describe("runAssistantTurn web search", () => {
  beforeEach(() => {
    mocks.createRepositoryBundle.mockReset().mockReturnValue(repoBundle())
    mocks.executeAssistantTool.mockReset()
    mocks.runGeminiAgentStep.mockReset()
  })

  it("runs grounding when paid users explicitly enable web search", async () => {
    mocks.runGeminiAgentStep
      .mockResolvedValueOnce({
        text: "I'll check.",
        functionCalls: [],
        groundingUris: [],
        groundingChunks: [],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 4, outputTokens: 4, totalTokens: 8 }
      })
      .mockResolvedValueOnce({
        text: "Alimkhan Yergebayev is associated with Relay.",
        functionCalls: [],
        groundingUris: ["https://example.com/alimkhan"],
        groundingChunks: [{ uri: "https://example.com/alimkhan", title: "Alimkhan profile" }],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
      })

    const events = await collect({
      message: "tell me about Alimkhan Yergebayev",
      surface: "dashboard",
      parentId: null,
      projectId: null,
      webSearch: true
    } as SendAssistantMessageInput)

    expect(mocks.runGeminiAgentStep).toHaveBeenCalledTimes(2)
    expect(mocks.runGeminiAgentStep).toHaveBeenLastCalledWith(
      expect.objectContaining({ tools: [], webSearch: true })
    )
    expect(events.some((e) => e.type === "tool_start" && e.tool === "web_search")).toBe(true)
    expect(events.some((e) => e.type === "tool_result" && e.result.tool === "web_search")).toBe(true)
    expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toContain("Sources")
  })

  it("falls back when the assistant model fails before explicit web grounding", async () => {
    mocks.runGeminiAgentStep
      .mockRejectedValueOnce(new GeminiRequestError("primary unavailable", 403, true, "generate"))
      .mockResolvedValueOnce({
        text: "I'll check.",
        functionCalls: [],
        groundingUris: [],
        groundingChunks: [],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 4, outputTokens: 4, totalTokens: 8 }
      })
      .mockResolvedValueOnce({
        text: "A grounded answer.",
        functionCalls: [],
        groundingUris: ["https://example.com/source"],
        groundingChunks: [{ uri: "https://example.com/source", title: "Source" }],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
      })

    const events = await collect({
      message: "try again, i enabled web search for you",
      surface: "dashboard",
      parentId: null,
      projectId: null,
      webSearch: true
    } as SendAssistantMessageInput)

    expect(mocks.runGeminiAgentStep).toHaveBeenCalledTimes(3)
    expect(events.some((e) => e.type === "error")).toBe(false)
    expect(events.some((e) => e.type === "tool_result" && e.result.tool === "web_search")).toBe(true)
  })

  it("treats who's as web-search intent for paid users", async () => {
    mocks.runGeminiAgentStep
      .mockResolvedValueOnce({
        text: "Let me check.",
        functionCalls: [],
        groundingUris: [],
        groundingChunks: [],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 4, outputTokens: 4, totalTokens: 8 }
      })
      .mockResolvedValueOnce({
        text: "Alimkhan Yergebayev is a founder.",
        functionCalls: [],
        groundingUris: ["https://example.com/profile"],
        groundingChunks: [{ uri: "https://example.com/profile", title: "Profile" }],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
      })

    await collect({
      message: "who's Alimkhan Yergebayev?",
      surface: "dashboard",
      parentId: null,
      projectId: null
    } as SendAssistantMessageInput)

    expect(mocks.runGeminiAgentStep).toHaveBeenCalledTimes(2)
    expect(mocks.runGeminiAgentStep).toHaveBeenLastCalledWith(
      expect.objectContaining({ tools: [], webSearch: true })
    )
  })

  it("bypasses Relay tools when the user asks for only web search", async () => {
    mocks.runGeminiAgentStep.mockResolvedValueOnce({
      text: "Alimkhan Yergebayev is associated with Relay.",
      functionCalls: [],
      groundingUris: ["https://example.com/alimkhan"],
      groundingChunks: [{ uri: "https://example.com/alimkhan", title: "Alimkhan profile" }],
      finishReason: "STOP",
      tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
    })

    const events = await collect({
      message: "only web search: who's Alimkhan Yergebayev?",
      surface: "dashboard",
      parentId: null,
      projectId: null
    } as SendAssistantMessageInput)

    expect(mocks.runGeminiAgentStep).toHaveBeenCalledTimes(1)
    expect(mocks.runGeminiAgentStep).toHaveBeenCalledWith(
      expect.objectContaining({ tools: [], webSearch: true })
    )
    expect(mocks.executeAssistantTool).not.toHaveBeenCalled()
    expect(events.some((e) => e.type === "tool_start" && e.tool === "web_search")).toBe(true)
  })
})
