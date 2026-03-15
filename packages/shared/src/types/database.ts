import type {
  aiJobKinds,
  aiJobStatuses,
  aiRenderers,
  bindingKinds,
  bootstrapPacketKinds,
  memoryItemTypes,
  sourceTurnRoles,
  supportedPlatforms,
  targetPlatforms
} from "../constants/platforms"

export type SupportedPlatform = (typeof supportedPlatforms)[number]
export type TargetPlatform = (typeof targetPlatforms)[number]
export type BootstrapPacketKind = (typeof bootstrapPacketKinds)[number]
export type AiRenderer = (typeof aiRenderers)[number]
export type AiJobKind = (typeof aiJobKinds)[number]
export type AiJobStatus = (typeof aiJobStatuses)[number]
export type SourceTurnRole = (typeof sourceTurnRoles)[number]
export type MemoryItemType = (typeof memoryItemTypes)[number]
export type BindingKind = (typeof bindingKinds)[number]
export type RelayOnboardingStatus = "pending" | "completed"
export type RelayOnboardingCompletionSurface = "web" | "extension"

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
  captureSignature: string | null
  metadata: Record<string, unknown>
  isArchived: boolean
  archivedAt: string | null
  archivedBy: string | null
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

export interface SessionDigestRow {
  id: string
  projectId: string
  sourceSessionId: string
  sourceSignature: string
  summaryShort: string
  structuredDigest: Record<string, unknown>
  confidence: number
  importanceScore: number
  needsProjectStateMerge: boolean
  mergedAt: string | null
  createdBy: string
  createdAt: string
}

export interface ProjectStateRow {
  projectId: string
  projectOverview: string | null
  currentObjective: string | null
  stackDomain: string | null
  recentProgress: string | null
  decisions: string[]
  constraints: string[]
  openTasks: string[]
  relevantTools: string[]
  lastBootstrapAt: string | null
  dirty: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectStateOverrideRow {
  projectId: string
  projectOverviewOverride: string | null
  currentObjectiveOverride: string | null
  recentProgressOverride: string | null
  hiddenDecisions: string[]
  hiddenConstraints: string[]
  hiddenOpenTasks: string[]
  createdAt: string
  updatedAt: string
}

export interface BootstrapPacketRow {
  id: string
  projectId: string
  targetProfileId: string
  kind: BootstrapPacketKind
  content: string
  structuredSnapshot: Record<string, unknown>
  renderer: AiRenderer
  generationMetadata: Record<string, unknown>
  createdBy: string
  createdAt: string
}

export interface AiJobRunRow {
  id: string
  projectId: string
  sessionId: string | null
  jobKind: AiJobKind
  status: AiJobStatus
  inputPayload: Record<string, unknown>
  outputPayload: Record<string, unknown>
  primaryModel: string | null
  actualModel: string | null
  fallbackUsed: boolean
  tokenUsage: Record<string, unknown>
  errorClass: string | null
  errorMessage: string | null
  attempts: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ExtensionConnectGrantRow {
  id: string
  userId: string
  deviceName: string
  grantHash: string
  grantPrefix: string
  apiBase: string
  expiresAt: string
  consumedAt: string | null
  createdAt: string
}

export interface UserOnboardingRow {
  userId: string
  status: RelayOnboardingStatus
  completedProjectId: string | null
  completedVia: RelayOnboardingCompletionSurface | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RelayOnboardingState {
  status: RelayOnboardingStatus
  completedProjectId: string | null
  completedVia: RelayOnboardingCompletionSurface | null
  completedAt: string | null
}

export interface BrowserSessionHandoffRow {
  id: string
  userId: string
  handoffHash: string
  handoffPrefix: string
  encryptedGoogleAccessToken: string
  encryptedGoogleIdToken: string
  nextPath: string
  expiresAt: string
  consumedAt: string | null
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

export interface CliAuthSessionRow {
  id: string
  sessionCode: string
  sessionHash: string
  sessionPrefix: string
  userId: string | null
  deviceName: string
  status: "pending" | "confirmed" | "expired"
  apiToken: string | null
  expiresAt: string
  confirmedAt: string | null
  createdAt: string
}
