import type {
  bindingKinds,
  memoryItemTypes,
  sourceTurnRoles,
  supportedPlatforms,
  targetPlatforms
} from "../constants/platforms"

export type SupportedPlatform = (typeof supportedPlatforms)[number]
export type TargetPlatform = (typeof targetPlatforms)[number]
export type SourceTurnRole = (typeof sourceTurnRoles)[number]
export type MemoryItemType = (typeof memoryItemTypes)[number]
export type BindingKind = (typeof bindingKinds)[number]

export interface ProfileRow {
  id: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectRow {
  id: string
  ownerId: string
  name: string
  slug: string
  description: string | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectMemberRow {
  id: string
  projectId: string
  userId: string
  role: "owner" | "editor" | "viewer"
  createdAt: string
}

export interface SourceSessionRow {
  id: string
  projectId: string
  platform: SupportedPlatform
  url: string
  title: string | null
  tabId: string | null
  windowId: string | null
  pageFingerprint: string | null
  metadata: Record<string, unknown>
  capturedAt: string
  createdAt: string
}

export interface SourceTurnRow {
  id: string
  sessionId: string
  role: SourceTurnRole
  turnIndex: number
  content: string
  contentHash: string
  rawHtml: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface MemoryItemRow {
  id: string
  projectId: string
  sourceTurnId: string | null
  type: MemoryItemType
  title: string | null
  content: string
  pinned: boolean
  isArchived: boolean
  sortOrder: number | null
  metadata: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TargetProfileRow {
  id: string
  key: string
  name: string
  platform: TargetPlatform
  description: string | null
  config: Record<string, unknown>
  createdAt: string
}

export interface ContextPacketRow {
  id: string
  projectId: string
  targetProfileId: string
  content: string
  sourceSnapshot: Record<string, unknown>
  createdBy: string
  createdAt: string
}

export interface ProjectBindingRow {
  id: string
  userId: string
  projectId: string
  bindingKind: BindingKind
  domain: string | null
  tabId: string | null
  platform: SupportedPlatform | null
  createdAt: string
  updatedAt: string
}

export interface CaptureEventRow {
  id: string
  userId: string
  projectId: string | null
  sessionId: string | null
  eventType: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface UserSettingsRow {
  userId: string
  settings: {
    enabledPlatforms: SupportedPlatform[]
    defaultTargetProfileKey: string
    autoCapture: boolean
    showSidepanelOnSupportedSites: boolean
  }
  createdAt: string
  updatedAt: string
}

export interface ExtensionApiTokenRow {
  id: string
  userId: string
  deviceName: string
  tokenHash: string
  tokenPrefix: string
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
  revokedAt: string | null
}
