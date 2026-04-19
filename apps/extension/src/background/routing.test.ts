import { describe, expect, it } from "vitest"

import {
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
        sourceConversationId: "chat_123",
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
          sourceConversationId: "chat_123",
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
        sourceConversationId: "chat_123",
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

  it("holds bootstrap chats that are clearly about a project by name", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/new-topic",
        title: "Relay launch checklist",
        recentRoutingText:
          "Relay launch checklist\nuser: List the remaining work for Relay onboarding and project capture.",
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

    expect(result.mode).toBe("hold")
    expect(result.candidateProjectId).toBe("project_relay")
    expect(result.confidence).toBe("medium")
  })

  it("uses saved project context to hold or auto-route context-aware chats", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/new-topic",
        title: "Quiet assistant follow-up",
        recentRoutingText:
          "Quiet assistant follow-up\nassistant: We should refine the continuity sidebar.\nuser: Refine the continuity sidebar and keyboard dismiss flow for the quiet assistant rewrite.",
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

  it("does not auto-save when the strongest bootstrap signal is a recent assistant reference", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/relay-review",
        title: "Logo refinement",
        recentRoutingText:
          "Logo refinement\nassistant: For Relay, keep the extension branding abstract and reduce the visible R shape.\nuser: make it flatter and more transparent.",
        recentUserTurnText: "make it flatter and more transparent."
      },
      projects: [
        {
          id: "project_relay",
          name: "Relay",
          slug: "relay",
          memoryCount: 0,
          sessionCount: 0,
          description: "Abstract branding system for the Relay extension.",
          routingContext: {
            hasMeaningfulContext: false,
            keywords: []
          }
        },
        {
          id: "project_other",
          name: "Sunnad",
          slug: "sunnad",
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

    expect(result.mode).toBe("hold")
    expect(result.candidateProjectId).toBe("project_relay")
    expect(result.confidence).toBe("medium")
  })

  it("keeps exact-name mentions on hold when they are visible but still unconfirmed", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/relay-review",
        title: "Logo refinement",
        recentRoutingText:
          "Logo refinement\nassistant: For Relay, keep the extension branding abstract and reduce the visible R shape.\nuser: make it flatter and more transparent.",
        recentUserTurnText: "make it flatter and more transparent.",
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
            keywords: [],
          },
        },
        {
          id: "project_other",
          name: "Sunnad",
          slug: "sunnad",
          memoryCount: 0,
          sessionCount: 0,
          routingContext: {
            hasMeaningfulContext: false,
            keywords: [],
          },
        },
      ],
      selectedProjectId: "project_other",
      lastTabProjectId: "project_other",
      boundProject: null,
      approvedAssociations: [],
    })

    expect(result.mode).toBe("hold")
    expect(result.confidence).toBe("medium")
    expect(result.candidateProjectId).toBe("project_relay")
    expect(result.diagnostics.explicitNameSignal).toBe(true)
  })

  it("uses project description overlap to route a fresh project without prior context", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/new-topic",
        title: "AI continuity assistant launch",
        recentRoutingText:
          "AI continuity assistant launch\nuser: Map the browser extension and project association flow for a quiet AI continuity assistant.",
        recentUserTurnText: "Map the browser extension and project association flow for a quiet AI continuity assistant."
      },
      projects: [
        {
          id: "project_relay_brand",
          name: "Relay",
          slug: "relay-brand-refresh",
          memoryCount: 0,
          sessionCount: 0,
          description:
            "Browser extension that keeps project continuity alive across fresh AI chats.",
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

    // Description-only overlap (no name/title/context signal) caps at hold
    // to prevent incidental keyword overlap from triggering auto-save
    expect(result.mode).toBe("hold")
    expect(result.confidence).toBe("medium")
    expect(result.candidateProjectId).toBe("project_relay_brand")
    expect(
      result.reasons.some((reason) =>
        reason.includes("project description"),
      ),
    ).toBe(true)
  })

  it("keeps project-focused bootstrap chats on hold even when another project is selected", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/new-topic",
        title: "Relay launch checklist",
        recentRoutingText:
          "Relay launch checklist\nuser: Finalize Relay onboarding and extension routing.",
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

    expect(result.mode).toBe("hold")
    expect(result.candidateProjectId).toBe("project_relay")
    expect(result.confidence).toBe("medium")
  })

  it("ignores unrelated fresh-project chats when the selected project only matches by selection", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/random",
        title: "Abstract logo exploration",
        recentRoutingText:
          "Abstract logo exploration\nuser: make it flatter and transparent",
        recentUserTurnText: "make it flatter and transparent"
      },
      projects: [
        {
          id: "project_relay_brand",
          name: "Relay",
          slug: "relay-brand-refresh",
          memoryCount: 0,
          sessionCount: 0,
          description:
            "Browser extension that keeps project continuity alive across fresh AI chats.",
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

    expect(result.mode).toBe("ignore")
    expect(result.confidence).toBe("low")
  })

  it("holds whole-chat matches when a fresh project lacks prior continuity context", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/relay-brand",
        title: "Abstract logo exploration",
        recentRoutingText:
          "Abstract logo exploration\nuser: make it flatter and transparent",
        recentUserTurnText: "make it flatter and transparent",
        fullVisibleRoutingText:
          "Abstract logo exploration\nuser: generate a logo for relay, make it abstract\nassistant: Here is a concept for Relay.\nuser: make it flatter and transparent"
      },
      projects: [
        {
          id: "project_relay_brand",
          name: "Relay",
          slug: "relay-brand-refresh",
          memoryCount: 0,
          sessionCount: 0,
          description:
            "Brand identity and browser extension visuals for Relay.",
          routingContext: {
            hasMeaningfulContext: false,
            keywords: []
          }
        },
        {
          id: "project_other",
          name: "Sunnad",
          slug: "sunnad",
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
      boundProject: { projectId: "project_other", bindingKind: "tab" },
      approvedAssociations: []
    })

    expect(result.mode).toBe("hold")
    expect(result.candidateProjectId).toBe("project_relay_brand")
    expect(
      result.reasons.some((reason) => reason.includes("visible chat turn")),
    ).toBe(true)
  })

  it("ignores unrelated chats even when the same domain was linked to another project", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/random",
        title: "Fat loss reality check",
        recentRoutingText:
          "Fat loss reality check\nuser: How much protein and daily walking do I need during Ramadan?",
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

  it("holds existing bootstrap chats when older turns are strong but continuity is still unconfirmed", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/chat_456",
        title: "Cross-model context orchestrator",
        recentRoutingText: [
          "Cross-model context orchestrator",
          "user: Please design the browser extension association flow for Relay's cross-model context orchestrator.",
          "assistant: I will map the Relay toast, sidebar, and project association logic.",
          "user: Now generate a logo for it and make it abstract.",
          "assistant: Image created for Relay."
        ].join("\n"),
        recentUserTurnText: "Now generate a logo for it and make it abstract."
      },
      projects: [
        {
          id: "project_sunnad",
          name: "Sunnad",
          slug: "sunnad",
          memoryCount: 0,
          sessionCount: 0,
          description: "Group-first Islamic habit tracking stripped of all visual noise.",
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
          description:
            "Relay is a browser-first cross-AI memory sidecar extension that keeps project context synchronized between ChatGPT, Claude, Perplexity, and other AIs autonomously.",
          routingContext: {
            hasMeaningfulContext: false,
            keywords: []
          }
        }
      ],
      selectedProjectId: "project_sunnad",
      lastTabProjectId: "project_sunnad",
      boundProject: { projectId: "project_sunnad", bindingKind: "tab" },
      approvedAssociations: []
    })

    expect(result.mode).toBe("hold")
    expect(result.confidence).toBe("medium")
    expect(result.candidateProjectId).toBe("project_relay")
  })

  it("ignores incidental single-name references when the chat is otherwise unrelated", () => {
    const result = evaluateProjectRouting({
      page: {
        supported: true,
        platform: "chatgpt",
        pathname: "/c/random",
        title: "Debugging a billing fetch",
        recentRoutingText:
          "Debugging a billing fetch\nuser: I mentioned Relay as a reference point, but this chat is about an unrelated API timeout.",
        recentUserTurnText:
          "I mentioned Relay as a reference point, but this chat is about an unrelated API timeout.",
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
            keywords: [],
          },
        },
      ],
      selectedProjectId: null,
      lastTabProjectId: null,
      boundProject: null,
      approvedAssociations: [],
    })

    expect(result.mode).toBe("ignore")
    expect(result.confidence).toBe("low")
    expect(result.candidateProjectId).toBeNull()
  })
})
