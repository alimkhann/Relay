import { describe, expect, it } from "vitest"

import { evaluateProjectRouting } from "./routing"

describe("evaluateProjectRouting", () => {
  it("auto-saves when an approved chat fingerprint matches exactly", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pageFingerprint: "chat_123",
        pathname: "/c/chat_123",
        title: "Relay architecture sync",
        recentUserTurnText: "Let's finish the Relay extension routing fix."
      },
      projects: [
        { id: "project_relay", name: "Relay", slug: "relay" },
        { id: "project_misc", name: "Personal", slug: "personal" }
      ],
      selectedProjectId: "project_misc",
      lastTabProjectId: "project_misc",
      boundProject: null,
      approvedAssociations: [
        {
          key: "chatgpt:fingerprint:chat_123",
          projectId: "project_relay",
          projectName: "Relay",
          projectSlug: "relay",
          platform: "chatgpt",
          domain: "chatgpt.com",
          pathname: "/c/chat_123",
          pageFingerprint: "chat_123",
          url: "https://chatgpt.com/c/chat_123",
          title: "Relay architecture sync",
          recentUserTurnText: "Let's finish the Relay extension routing fix.",
          sessionId: "session_1",
          approvedAt: "2026-03-13T00:00:00.000Z"
        }
      ]
    })

    expect(result.mode).toBe("auto-save")
    expect(result.candidateProjectId).toBe("project_relay")
    expect(result.confidence).toBe("high")
  })

  it("holds for review when only lightweight text overlap exists", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/new-topic",
        title: "Relay planning notes",
        recentUserTurnText: "Need to think through Relay pricing and capture policy."
      },
      projects: [
        { id: "project_relay", name: "Relay", slug: "relay" },
        { id: "project_other", name: "Garden Journal", slug: "garden-journal" }
      ],
      selectedProjectId: "project_other",
      lastTabProjectId: "project_other",
      boundProject: null,
      approvedAssociations: []
    })

    expect(result.mode).toBe("hold")
    expect(result.candidateProjectId).toBe("project_relay")
    expect(result.confidence).toBe("medium")
  })

  it("ignores chats without meaningful project signals", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/random",
        title: "Weekend plans",
        recentUserTurnText: "What should I cook for dinner tonight?"
      },
      projects: [{ id: "project_relay", name: "Relay", slug: "relay" }],
      selectedProjectId: null,
      lastTabProjectId: null,
      boundProject: null,
      approvedAssociations: []
    })

    expect(result.mode).toBe("ignore")
    expect(result.confidence).toBe("low")
  })
})
