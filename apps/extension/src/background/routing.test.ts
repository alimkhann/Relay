import { describe, expect, it } from "vitest"

import {
  FRESH_PROJECT_BOOTSTRAP_REASON,
  evaluateProjectRouting,
  findApprovedAssociationMatch,
} from "./routing"

describe("evaluateProjectRouting", () => {
  it("recognizes an already approved chat before broader routing signals", () => {
    const approvedAssociations = [
      {
        key: "chatgpt:fingerprint:chat_123",
        projectId: "project_relay",
        projectName: "Relay",
        projectSlug: "relay",
        platform: "chatgpt" as const,
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

    expect(
      findApprovedAssociationMatch(
        {
          platform: "chatgpt",
          pageFingerprint: "chat_123",
          pathname: "/c/chat_123",
          url: "https://chatgpt.com/c/chat_123"
        },
        approvedAssociations
      )?.projectId
    ).toBe("project_relay")

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
        {
          id: "project_relay",
          name: "Relay",
          slug: "relay",
          memoryCount: 8,
          sessionCount: 3,
          routingContext: {
            hasMeaningfulContext: true,
            keywords: ["extension", "routing", "capture", "continuity"]
          }
        },
        { id: "project_misc", name: "Personal", slug: "personal", memoryCount: 0, sessionCount: 0 }
      ],
      selectedProjectId: "project_misc",
      lastTabProjectId: "project_misc",
      boundProject: null,
      approvedAssociations
    })

    expect(result.mode).toBe("auto-save")
    expect(result.candidateProjectId).toBe("project_relay")
    expect(result.confidence).toBe("high")
  })

  it("allows bootstrap-phase auto-save only on strong explicit project-name evidence", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/new-topic",
        title: "Relay launch checklist",
        recentUserTurnText: "List the remaining work for Relay onboarding and project capture."
      },
      projects: [
        {
          id: "project_relay",
          name: "Relay",
          slug: "relay",
          memoryCount: 0,
          sessionCount: 0,
          routingContext: {
            hasMeaningfulContext: false,
            keywords: []
          }
        },
        {
          id: "project_other",
          name: "Garden Journal",
          slug: "garden-journal",
          memoryCount: 0,
          sessionCount: 0,
          routingContext: {
            hasMeaningfulContext: false,
            keywords: []
          }
        }
      ],
      selectedProjectId: "project_other",
      lastTabProjectId: "project_other",
      boundProject: null,
      approvedAssociations: []
    })

    expect(result.mode).toBe("auto-save")
    expect(result.candidateProjectId).toBe("project_relay")
    expect(result.confidence).toBe("high")
  })

  it("uses saved project context to hold or auto-route context-aware chats", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/new-topic",
        title: "Quiet assistant follow-up",
        recentUserTurnText:
          "Refine the continuity sidebar and keyboard dismiss flow for the quiet assistant rewrite."
      },
      projects: [
        {
          id: "project_relay",
          name: "Relay",
          slug: "relay",
          memoryCount: 10,
          sessionCount: 5,
          routingContext: {
            hasMeaningfulContext: true,
            keywords: ["continuity", "quiet", "assistant", "sidebar", "dismiss", "rewrite"]
          }
        },
        {
          id: "project_fitness",
          name: "Ramadan Full Body Workout",
          slug: "ramadan-full-body-workout",
          memoryCount: 2,
          sessionCount: 1,
          routingContext: {
            hasMeaningfulContext: true,
            keywords: ["ramadan", "protein", "deficit", "steps", "fat", "loss"]
          }
        }
      ],
      selectedProjectId: "project_fitness",
      lastTabProjectId: "project_fitness",
      boundProject: { projectId: "project_fitness", bindingKind: "domain" },
      approvedAssociations: []
    })

    expect(result.candidateProjectId).toBe("project_relay")
    expect(["hold", "auto-save"]).toContain(result.mode)
    expect(["medium", "high"]).toContain(result.confidence)
  })

  it("holds the selected fresh project instead of ignoring the first ungrounded chat", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/new-topic",
        title: "Abstract logo exploration",
        recentUserTurnText: "nice, make it flat and transparent"
      },
      projects: [
        {
          id: "project_relay_brand",
          name: "Relay Brand Refresh",
          slug: "relay-brand-refresh",
          memoryCount: 0,
          sessionCount: 0,
          routingContext: {
            hasMeaningfulContext: false,
            keywords: []
          }
        }
      ],
      selectedProjectId: "project_relay_brand",
      lastTabProjectId: "project_relay_brand",
      boundProject: { projectId: "project_relay_brand", bindingKind: "tab" },
      approvedAssociations: []
    })

    expect(result.mode).toBe("hold")
    expect(result.confidence).toBe("medium")
    expect(result.candidateProjectId).toBe("project_relay_brand")
    expect(result.reasons[0]).toBe(FRESH_PROJECT_BOOTSTRAP_REASON)
  })

  it("does not override stronger explicit routing evidence with the fresh-project bootstrap fallback", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/new-topic",
        title: "Relay launch checklist",
        recentUserTurnText: "Finalize Relay onboarding and extension routing."
      },
      projects: [
        {
          id: "project_selected",
          name: "Garden Journal",
          slug: "garden-journal",
          memoryCount: 0,
          sessionCount: 0,
          routingContext: {
            hasMeaningfulContext: false,
            keywords: []
          }
        },
        {
          id: "project_relay",
          name: "Relay",
          slug: "relay",
          memoryCount: 0,
          sessionCount: 0,
          routingContext: {
            hasMeaningfulContext: false,
            keywords: []
          }
        }
      ],
      selectedProjectId: "project_selected",
      lastTabProjectId: "project_selected",
      boundProject: { projectId: "project_selected", bindingKind: "tab" },
      approvedAssociations: []
    })

    expect(result.mode).toBe("auto-save")
    expect(result.candidateProjectId).toBe("project_relay")
    expect(result.confidence).toBe("high")
  })

  it("ignores unrelated chats even when the same domain was linked to another project", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/random",
        title: "Fat loss reality check",
        recentUserTurnText: "How much protein and daily walking do I need during Ramadan?"
      },
      projects: [
        {
          id: "project_relay",
          name: "Relay",
          slug: "relay",
          memoryCount: 8,
          sessionCount: 4,
          routingContext: {
            hasMeaningfulContext: true,
            keywords: ["extension", "routing", "context", "sidebar", "toast", "capture"]
          }
        }
      ],
      selectedProjectId: "project_relay",
      lastTabProjectId: "project_relay",
      boundProject: { projectId: "project_relay", bindingKind: "domain" },
      approvedAssociations: []
    })

    expect(result.mode).toBe("ignore")
    expect(result.confidence).toBe("low")
  })
})
