import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AssistantActionResult, AssistantStreamEvent, SendAssistantMessageInput } from "@relay/shared"

import type { Viewer } from "@/server/policies/viewer"

import type * as GeminiService from "./gemini-service"
import type * as AssistantTools from "./assistant-tools"

const mocks = vi.hoisted(() => ({
  createRepositoryBundle: vi.fn(),
  executeAssistantTool: vi.fn(),
  runGeminiAgentStep: vi.fn(),
  getDecryptedSourceObject: vi.fn(),
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

vi.mock("@/server/services/source-storage-service", () => ({
  getDecryptedSourceObject: mocks.getDecryptedSourceObject
}))

vi.mock("./gemini-service", async (importActual) => {
  const actual = await importActual<typeof GeminiService>()
  return { ...actual, runGeminiAgentStep: mocks.runGeminiAgentStep }
})

vi.mock("./assistant-tools", async (importActual) => {
  const actual = await importActual<typeof AssistantTools>()
  return { ...actual, executeAssistantTool: mocks.executeAssistantTool }
})

import { classifyAssistantActionQuota, runAssistantTurn } from "./assistant-agent-service"

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
    },
    assistantAttachments: {
      listByIds: vi.fn(async () => [])
    },
    projects: {
      getPersonalProject: vi.fn(async () => null)
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
    mocks.getDecryptedSourceObject.mockReset()
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

  it("persists and streams intermediate action results when confirm pauses the turn", async () => {
    const repos = repoBundle()
    mocks.createRepositoryBundle.mockReturnValue(repos)

    const createResult: AssistantActionResult = {
      tool: "add_memory",
      action: "created",
      entity: "memory item",
      count: 1,
      items: [{ id: "mem1", label: "test" }]
    }

    mocks.runGeminiAgentStep.mockResolvedValueOnce({
      text: "",
      functionCalls: [
        { name: "add_memory", args: { projectId: "p1", type: "decision", content: "test" } },
        { name: "manage_memory", args: { action: "update", memoryId: "m1", content: "test 2" } }
      ],
      groundingUris: [],
      groundingChunks: [],
      finishReason: null,
      tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
    })
    mocks.executeAssistantTool.mockResolvedValueOnce({
      modelResponse: { result: "saved" },
      actionResult: createResult
    })

    const events = await collect({
      message: "create test and edit note",
      surface: "extension",
      parentId: null,
      projectId: "p1"
    } as unknown as SendAssistantMessageInput)

    expect(events.filter((e) => e.type === "tool_result")).toHaveLength(1)
    expect(events.find((e) => e.type === "tool_result")).toEqual({
      type: "tool_result",
      result: createResult
    })
    expect(events.some((e) => e.type === "pending_action")).toBe(true)

    type CreateArg = {
      toolName?: string
      toolPayload?: { actionResults?: AssistantActionResult[] }
    }
    const pendingCreate = (
      repos.assistantMessages.create.mock.calls as unknown as Array<[CreateArg]>
    ).find((call) => call[0]?.toolName === "pending_action")
    expect(pendingCreate).toBeTruthy()
    const payload = pendingCreate![0].toolPayload
    expect(payload?.actionResults).toEqual([createResult])
    expect(mocks.executeAssistantTool).toHaveBeenCalledTimes(1)
  })

  it("exposes write tools for add/create memory requests", async () => {
    mocks.runGeminiAgentStep.mockResolvedValueOnce({
      text: "I can add that decision.",
      functionCalls: [],
      groundingUris: [],
      groundingChunks: [],
      finishReason: "STOP",
      tokenUsage: { inputTokens: 3, outputTokens: 3, totalTokens: 6 }
    })

    await collect({
      message: "add a test decision memory item",
      surface: "extension",
      parentId: null,
      projectId: "11111111-1111-4111-8111-111111111111"
    } as unknown as SendAssistantMessageInput)

    const firstCall = mocks.runGeminiAgentStep.mock.calls[0]?.[0] as
      | { tools?: Array<{ name: string }> }
      | undefined
    const toolNames = firstCall?.tools?.map((tool) => tool.name) ?? []
    expect(toolNames).toContain("add_memory")
    expect(toolNames).toContain("manage_memory")
  })

  it("injects the selected project into scoped tool calls without listing projects first", async () => {
    mocks.runGeminiAgentStep
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [{ name: "add_memory", args: { type: "decision", content: "Use focused tests." } }],
        groundingUris: [],
        groundingChunks: [],
        finishReason: null,
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
      })
      .mockResolvedValueOnce({
        text: "Saved the decision.",
        functionCalls: [],
        groundingUris: [],
        groundingChunks: [],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 3, outputTokens: 3, totalTokens: 6 }
      })
    mocks.executeAssistantTool.mockResolvedValue({
      modelResponse: { result: "saved" },
      actionResult: null
    })

    await collect({
      message: "create a decision that we use focused tests",
      surface: "extension",
      parentId: null,
      projectId: "11111111-1111-4111-8111-111111111111"
    } as SendAssistantMessageInput)

    expect(mocks.executeAssistantTool).toHaveBeenCalledWith(
      expect.anything(),
      "add_memory",
      expect.objectContaining({ projectId: "11111111-1111-4111-8111-111111111111" }),
      expect.anything()
    )
    expect(mocks.executeAssistantTool).toHaveBeenCalledTimes(1)
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
      },
      projects: {
        getPersonalProject: vi.fn(async () => null)
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

  it("declining an action updates it in place without creating a synthetic user message or calling Gemini", async () => {
    const updateToolPayload = vi.fn(async () => {})
    const createMessage = vi.fn(async () => ({ id: "m1" }))
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
          args: { action: "delete", memoryId: ["m9"] },
          status: "pending"
        }
      },
      createdAt: "2026-06-09T00:00:00Z"
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
        create: vi.fn(),
        touch: vi.fn(async () => {})
      },
      assistantMessages: {
        listByChat: vi.fn(async () => [pendingMessage]),
        create: createMessage,
        updateToolPayload
      },
      assistantAttachments: { listByIds: vi.fn(async () => []) },
      projects: { getPersonalProject: vi.fn(async () => null) }
    })

    const events = await collect({
      message: "decline action",
      surface: "dashboard",
      chatId: "c1",
      parentId: "pm1",
      projectId: null,
      actionDecision: { actionId: "pending-1", decision: "decline" }
    } as SendAssistantMessageInput)

    expect(createMessage).not.toHaveBeenCalled()
    expect(mocks.runGeminiAgentStep).not.toHaveBeenCalled()
    expect(updateToolPayload).toHaveBeenCalledWith(
      "pm1",
      expect.objectContaining({
        pendingAction: expect.objectContaining({ id: "pending-1", status: "declined" })
      })
    )
    expect(events.some((event) => event.type === "action_update")).toBe(true)
  })

  it("persists and resolves a running preview when allow-all executes a destructive action", async () => {
    const updateToolPayload = vi.fn(async () => {})
    const createMessage = vi
      .fn()
      .mockResolvedValueOnce({ id: "user-1" })
      .mockResolvedValueOnce({ id: "action-1" })
      .mockResolvedValueOnce({ id: "tool-1" })
      .mockResolvedValueOnce({ id: "assistant-1" })
    mocks.createRepositoryBundle.mockReset().mockReturnValue({
      ...repoBundle(),
      assistantMessages: {
        listByChat: vi.fn(async () => []),
        create: createMessage,
        updateToolPayload
      }
    })
    mocks.runGeminiAgentStep
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [{ name: "manage_memory", args: { action: "delete", memoryId: ["m9"] } }],
        groundingChunks: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      })
      .mockResolvedValueOnce({
        text: "Deleted the memory item.",
        functionCalls: [],
        groundingChunks: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      })
    mocks.executeAssistantTool.mockResolvedValue({
      modelResponse: { result: "deleted" },
      actionResult: {
        tool: "manage_memory",
        action: "deleted",
        entity: "memory item",
        count: 1
      }
    })

    const events = await collect({
      message: "delete it",
      surface: "dashboard",
      parentId: null,
      projectId: "p1",
      autoApproveDestructive: true
    } as SendAssistantMessageInput)

    expect(events).toContainEqual({
      type: "pending_action",
      action: expect.objectContaining({ status: "running", tool: "manage_memory" })
    })
    expect(events).toContainEqual({
      type: "action_update",
      action: expect.objectContaining({ status: "succeeded", tool: "manage_memory" })
    })
    expect(events.filter((event) => event.type === "tool_result")).toHaveLength(0)
    expect(updateToolPayload).toHaveBeenCalledWith(
      "action-1",
      expect.objectContaining({
        pendingAction: expect.objectContaining({ status: "succeeded" })
      })
    )
  })

  it("gives tools to a noun-less write follow-up (rename it) instead of erroring", async () => {
    // Regression: "rename it to test2" has no Relay noun, so keyword gating used
    // to strip every tool — the model then returned empty text and the turn
    // failed with "I couldn't produce a reliable response". Write intent must
    // win regardless of nouns.
    mocks.createRepositoryBundle.mockReset().mockReturnValue({
      ...repoBundle(),
      assistantMessages: {
        listByChat: vi.fn(async () => []),
        create: vi.fn(async () => ({ id: "action-1" })),
        updateToolPayload: vi.fn(async () => {})
      }
    })
    mocks.runGeminiAgentStep
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [
          { name: "manage_memory", args: { action: "update", memoryId: ["m9"], content: "test2" } }
        ],
        groundingChunks: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      })
      .mockResolvedValueOnce({
        text: "Renamed it to test2.",
        functionCalls: [],
        groundingChunks: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      })
    mocks.executeAssistantTool.mockResolvedValue({
      modelResponse: { result: "updated" },
      actionResult: { tool: "manage_memory", action: "updated", entity: "memory item", count: 1 }
    })

    const events = await collect({
      message: "rename it to test2",
      surface: "dashboard",
      parentId: null,
      projectId: "p1",
      autoApproveDestructive: true
    } as SendAssistantMessageInput)

    // Tools were actually offered to the model on the first step.
    expect(mocks.runGeminiAgentStep.mock.calls[0]?.[0]?.tools?.length ?? 0).toBeGreaterThan(0)
    // The action executed and there is no empty-response error.
    expect(events).toContainEqual({
      type: "action_update",
      action: expect.objectContaining({ status: "succeeded", tool: "manage_memory" })
    })
    expect(
      events.some((e) => e.type === "error" && /reliable response/.test(e.message))
    ).toBe(false)
  })

  it("keeps tools available for a pronoun follow-up via prior tool activity", async () => {
    // A continuation with no write verb AND no Relay noun ("and the other one
    // too") must still get tools when the chat already has tool activity — the
    // hasPriorToolActivity branch. Without it the turn would be tool-stripped.
    const priorAssistant = {
      id: "a1",
      chatId: "c1",
      userId: "u1",
      role: "assistant" as const,
      parentId: null,
      content: "Created the decision.",
      toolName: null,
      toolPayload: {
        actionResults: [{ tool: "add_memory", action: "created", entity: "memory item", count: 1 }]
      },
      createdAt: "2026-06-09T00:00:00Z"
    }
    mocks.createRepositoryBundle.mockReset().mockReturnValue({
      assistantChats: {
        getById: vi.fn(async () => ({ id: "c1", userId: "u1", projectId: "p1", surface: "dashboard", title: "t" })),
        create: vi.fn(),
        touch: vi.fn(async () => {})
      },
      assistantMessages: {
        listByChat: vi.fn(async () => [priorAssistant]),
        create: vi.fn(async () => ({ id: "action-1" })),
        updateToolPayload: vi.fn(async () => {})
      },
      assistantAttachments: { listByIds: vi.fn(async () => []) },
      projects: { getPersonalProject: vi.fn(async () => null) }
    })
    mocks.runGeminiAgentStep
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [{ name: "add_memory", args: { type: "decision", content: "other" } }],
        groundingChunks: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      })
      .mockResolvedValueOnce({
        text: "Added the other one too.",
        functionCalls: [],
        groundingChunks: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      })
    mocks.executeAssistantTool.mockResolvedValue({
      modelResponse: { result: "saved" },
      actionResult: { tool: "add_memory", action: "created", entity: "memory item", count: 1 }
    })

    await collect({
      message: "and the other one too",
      surface: "dashboard",
      chatId: "c1",
      parentId: "a1",
      projectId: "p1"
    } as SendAssistantMessageInput)

    // The continuation got the full tool set despite no write verb / Relay noun.
    expect(mocks.runGeminiAgentStep.mock.calls[0]?.[0]?.tools?.length ?? 0).toBeGreaterThan(0)
  })

  it("does not repeat an identical failing tool call within a turn", async () => {
    mocks.runGeminiAgentStep
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [{ name: "search_memory", args: { query: "missing" } }],
        groundingChunks: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      })
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [{ name: "search_memory", args: { query: "missing" } }],
        groundingChunks: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      })
      .mockResolvedValueOnce({
        text: "I could not search memory because the tool failed.",
        functionCalls: [],
        groundingChunks: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      })
    mocks.executeAssistantTool.mockRejectedValueOnce(new Error("temporary failure"))

    await collect({
      message: "search my memory for missing",
      surface: "dashboard",
      parentId: null,
      projectId: "p1"
    } as SendAssistantMessageInput)

    expect(mocks.executeAssistantTool).toHaveBeenCalledTimes(1)
  })
})

describe("runAssistantTurn web search", () => {
  beforeEach(() => {
    mocks.createRepositoryBundle.mockReset().mockReturnValue(repoBundle())
    mocks.executeAssistantTool.mockReset()
    mocks.runGeminiAgentStep.mockReset()
  })

  it("injects a web-search hint when the user enables the toggle and runs the tool the model calls", async () => {
    // Step 1: model decides to call web_search; step 2: final text answer.
    mocks.runGeminiAgentStep
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [{ name: "web_search", args: { query: "Alimkhan Yergebayev" } }],
        groundingUris: [],
        groundingChunks: [],
        finishReason: null,
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
      })
      .mockResolvedValueOnce({
        text: "Alimkhan Yergebayev is associated with Relay.",
        functionCalls: [],
        groundingUris: [],
        groundingChunks: [],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
      })
    mocks.executeAssistantTool.mockResolvedValueOnce({
      modelResponse: { result: "grounded summary" },
      actionResult: {
        tool: "web_search",
        action: "read",
        entity: "web",
        count: 1,
        items: [{ id: "https://example.com/alimkhan", label: "Alimkhan profile" }]
      }
    })

    const events = await collect({
      message: "tell me about Alimkhan Yergebayev",
      surface: "dashboard",
      parentId: null,
      projectId: null,
      webSearch: true
    } as SendAssistantMessageInput)

    // The toggle becomes a hint in the conversation, not a separate pass.
    const firstCall = mocks.runGeminiAgentStep.mock.calls[0]![0] as {
      contents: Array<{ parts: Array<{ text?: string }> }>
      tools: unknown[]
    }
    expect(JSON.stringify(firstCall.contents)).toContain("enabled web search")
    expect(firstCall.tools.length).toBeGreaterThan(0)
    expect(mocks.executeAssistantTool).toHaveBeenCalledWith(
      expect.anything(),
      "web_search",
      expect.objectContaining({ query: "Alimkhan Yergebayev" }),
      expect.anything()
    )
    expect(events.some((e) => e.type === "tool_result" && e.result.tool === "web_search")).toBe(true)
  })




  it("persists attachment ids on the user message and sends image data to Gemini", async () => {
    const bundle = repoBundle()
    const createMessage = vi.fn(async () => ({ id: "m1" }))
    bundle.assistantMessages.create = createMessage
    bundle.assistantAttachments.listByIds = vi.fn(async () => [
      {
        id: "11111111-1111-4111-8111-111111111111",
        chatId: "c1",
        userId: "u1",
        fileName: "note.png",
        mime: "image/png",
        byteSize: 12,
        storageKey: "assistant/u1/c1/image-object.png",
        extractedText: null,
        savedToRelay: false,
        createdAt: "2026-05-20T00:00:00Z"
      }
    ])
    mocks.createRepositoryBundle.mockReturnValue(bundle)
    mocks.getDecryptedSourceObject.mockResolvedValue(Buffer.from("png-bytes"))
    mocks.runGeminiAgentStep.mockResolvedValueOnce({
      text: "The image says hello.",
      functionCalls: [],
      groundingUris: [],
      groundingChunks: [],
      finishReason: "STOP",
      tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
    })

    await collect({
      message: "what's written here?",
      surface: "dashboard",
      parentId: null,
      projectId: null,
      attachmentIds: ["11111111-1111-4111-8111-111111111111"]
    } as SendAssistantMessageInput)

    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        toolPayload: { attachmentIds: ["11111111-1111-4111-8111-111111111111"] }
      })
    )
    expect(mocks.runGeminiAgentStep).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                inlineData: expect.objectContaining({ mimeType: "image/png" })
              })
            ])
          })
        ])
      })
    )
  })

  it("answers simple prompts as a plain chatbot turn (tools offered, none used)", async () => {
    mocks.runGeminiAgentStep.mockResolvedValueOnce({
      text: "Hello.",
      functionCalls: [],
      groundingUris: [],
      groundingChunks: [],
      finishReason: "STOP",
      tokenUsage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 }
    })

    const events = await collect({
      message: "say hello",
      surface: "dashboard",
      parentId: null,
      projectId: null
    } as SendAssistantMessageInput)

    // v2: every turn runs the agent model with the FULL tool set; small talk
    // simply produces a text answer with no tool calls.
    expect(mocks.runGeminiAgentStep).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3-flash-preview" })
    )
    expect(mocks.executeAssistantTool).not.toHaveBeenCalled()
    expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toBe("Hello.")
  })

  it("does not charge broad casual words as Relay reads", () => {
    expect(classifyAssistantActionQuota("Help me plan a project task")).toBeNull()
    expect(classifyAssistantActionQuota("What are my saved Relay tasks?")).toBe("read")
    expect(classifyAssistantActionQuota("Save this decision to my project")).toBe("write")
  })

  it("charges pronoun write follow-ups but not bare write-verb chatter", () => {
    // Pronoun referencing a prior item → real write.
    expect(classifyAssistantActionQuota("rename it to test2")).toBe("write")
    expect(classifyAssistantActionQuota("delete it")).toBe("write")
    // Write verb with no Relay target → not charged.
    expect(classifyAssistantActionQuota("add some detail to your answer")).toBeNull()
  })

  it("persists a manual compact checkpoint without calling the model", async () => {
    const repositories = repoBundle()
    repositories.assistantMessages.listByChat.mockResolvedValue([
      { id: "u1", parentId: null, role: "user", content: "Earlier context", toolPayload: null }
    ] as never)
    mocks.createRepositoryBundle.mockReturnValue(repositories)

    const events = await collect({
      message: "/compact",
      surface: "dashboard",
      parentId: "u1",
      projectId: null
    } as SendAssistantMessageInput)

    expect(mocks.runGeminiAgentStep).not.toHaveBeenCalled()
    expect(repositories.assistantMessages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "compaction_checkpoint",
        toolPayload: expect.objectContaining({ compaction: expect.any(Object) })
      })
    )
    expect(events.some((event) => event.type === "done")).toBe(true)
  })

  it("queues every destructive action from a multi-action model step", async () => {
    mocks.runGeminiAgentStep.mockResolvedValueOnce({
      text: "",
      functionCalls: [
        { name: "manage_memory", args: { action: "delete", memoryId: ["x1"] } },
        { name: "manage_memory", args: { action: "delete", memoryId: ["x2"] } }
      ],
      groundingUris: [],
      groundingChunks: [],
      finishReason: null,
      tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
    })

    const events = await collect({
      message: "Delete both saved Relay memories",
      surface: "dashboard",
      parentId: null,
      projectId: null
    } as SendAssistantMessageInput)

    expect(events.filter((event) => event.type === "pending_action")).toHaveLength(2)
    expect(mocks.executeAssistantTool).not.toHaveBeenCalled()
  })

  it("does not claim Done when Gemini returns an empty answer", async () => {
    mocks.runGeminiAgentStep
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [],
        groundingUris: [],
        groundingChunks: [],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 5, outputTokens: 0, totalTokens: 5 }
      })
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [],
        groundingUris: [],
        groundingChunks: [],
        finishReason: "STOP",
        tokenUsage: { inputTokens: 5, outputTokens: 0, totalTokens: 5 }
      })

    const events = await collect({
      message: "?",
      surface: "dashboard",
      parentId: null,
      projectId: null
    } as SendAssistantMessageInput)

    const text = events.filter((event) => event.type === "text").map((event) => event.delta).join("")
    expect(text).not.toBe("Done.")
    // Empty answers now stream a readable fallback message (not an error
    // banner) and the turn ends cleanly; telemetry records the failure.
    expect(text).toContain("couldn't produce a reliable response")
    expect(events.some((event) => event.type === "done")).toBe(true)
  })
})
