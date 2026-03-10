import type {
  CaptureEventRow,
  ContextPacketRow,
  MemoryItemRow,
  ProfileRow,
  ProjectBindingRow,
  ProjectMemberRow,
  ProjectRow,
  SourceSessionRow,
  SourceTurnRow,
  TargetProfileRow,
  UserSettingsRow
} from "@relay/shared"
import { isoNow } from "@relay/shared"

export interface RelayStore {
  profiles: ProfileRow[]
  projects: ProjectRow[]
  projectMembers: ProjectMemberRow[]
  sessions: SourceSessionRow[]
  turns: SourceTurnRow[]
  memoryItems: MemoryItemRow[]
  targetProfiles: TargetProfileRow[]
  contextPackets: ContextPacketRow[]
  bindings: ProjectBindingRow[]
  captureEvents: CaptureEventRow[]
  userSettings: UserSettingsRow[]
}

const now = isoNow()
const demoUserId = process.env.RELAY_DEFAULT_USER_ID ?? "demo-user"

const store: RelayStore = {
  profiles: [
    {
      id: demoUserId,
      email: "demo@relay.local",
      displayName: "Relay Demo",
      avatarUrl: null,
      createdAt: now,
      updatedAt: now
    }
  ],
  projects: [
    {
      id: "project-relay-mvp",
      ownerId: demoUserId,
      name: "Relay MVP",
      slug: "relay-mvp",
      description: "Browser-first project memory sidecar.",
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }
  ],
  projectMembers: [
    {
      id: "member-relay-mvp",
      projectId: "project-relay-mvp",
      userId: demoUserId,
      role: "owner",
      createdAt: now
    }
  ],
  sessions: [
    {
      id: "session-relay-1",
      projectId: "project-relay-mvp",
      platform: "chatgpt",
      url: "https://chatgpt.com/c/relay-mvp",
      title: "Relay MVP architecture",
      tabId: "10",
      windowId: "1",
      pageFingerprint: "relay-mvp",
      metadata: { domain: "chatgpt.com" },
      capturedAt: now,
      createdAt: now
    }
  ],
  turns: [
    {
      id: "turn-relay-1",
      sessionId: "session-relay-1",
      role: "user",
      turnIndex: 0,
      content: "Design a browser-first AI memory sidecar.",
      contentHash: "seed-turn-1",
      rawHtml: null,
      metadata: {},
      createdAt: now
    }
  ],
  memoryItems: [
    {
      id: "memory-relay-decision",
      projectId: "project-relay-mvp",
      sourceTurnId: "turn-relay-1",
      type: "decision",
      title: "Monorepo",
      content: "Use a pnpm monorepo with apps/web, apps/extension, and shared packages.",
      pinned: true,
      isArchived: false,
      sortOrder: 1,
      metadata: {},
      createdBy: demoUserId,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "memory-relay-constraint",
      projectId: "project-relay-mvp",
      sourceTurnId: null,
      type: "constraint",
      title: "MVP scope",
      content: "Avoid vector databases and autonomous behavior in the MVP.",
      pinned: true,
      isArchived: false,
      sortOrder: 2,
      metadata: {},
      createdBy: demoUserId,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "memory-relay-task",
      projectId: "project-relay-mvp",
      sourceTurnId: null,
      type: "task",
      title: "Critical loop",
      content: "Prove capture, pinning, and one-click insertion across supported tools.",
      pinned: false,
      isArchived: false,
      sortOrder: 3,
      metadata: {},
      createdBy: demoUserId,
      createdAt: now,
      updatedAt: now
    }
  ],
  targetProfiles: [
    {
      id: "tp-chatgpt-planning",
      key: "chatgpt_planning",
      name: "ChatGPT Planning",
      platform: "chatgpt",
      description: "Planning-oriented context packet",
      config: {},
      createdAt: now
    },
    {
      id: "tp-perplexity-research",
      key: "perplexity_research",
      name: "Perplexity Research",
      platform: "perplexity",
      description: "Research-oriented context packet",
      config: {},
      createdAt: now
    },
    {
      id: "tp-claude-code",
      key: "claude_code_build",
      name: "Claude Code Build",
      platform: "claude_code",
      description: "Implementation handoff",
      config: {},
      createdAt: now
    },
    {
      id: "tp-codex",
      key: "codex_implementation",
      name: "Codex Implementation",
      platform: "codex",
      description: "Implementation handoff",
      config: {},
      createdAt: now
    }
  ],
  contextPackets: [],
  bindings: [],
  captureEvents: [],
  userSettings: [
    {
      userId: demoUserId,
      settings: {
        enabledPlatforms: ["chatgpt", "perplexity", "claude"],
        defaultTargetProfileKey: "claude_code_build",
        autoCapture: true,
        showSidepanelOnSupportedSites: true
      },
      createdAt: now,
      updatedAt: now
    }
  ]
}

export function getDemoStore(): RelayStore {
  return store
}
