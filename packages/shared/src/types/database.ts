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
export type ExtensionApiTokenPurpose = "manual" | "cli_mcp"
export type SyncSurface = "mcp" | "cli" | "chatgpt" | "claude" | "codex" | "opencode" | "gemini" | "cursor" | "warp" | "windsurf" | "antigravity" | "grok" | "perplexity" | "deepseek"
export type McpTokenScope = "project:read" | "project:write" | "memory:read" | "memory:write" | "brief:read"
export type WorkSessionSurface = SyncSurface | "web" | "api"
export type WorkSessionStatus = "active" | "closed" | "stale"

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
  /** Normalized conversation ID extracted from URL (e.g., "c/abc123" for ChatGPT) */
  sourceConversationId: string | null
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

/** Source surface where a memory item was captured from */
export type SourceSurface =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "grok"
  | "perplexity"
  | "deepseek"
  | "codex"
  | "mcp"
  | "web"
  | "api"

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
  tags: string[]
  metadata: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
  /** Origin surface: chatgpt, claude, gemini, grok, perplexity, deepseek, codex, mcp, web, api */
  sourceSurface: SourceSurface | null
  /** Normalized conversation ID for linking (e.g., c/abc123 for ChatGPT) */
  sourceConversationId: string | null
  /** Full URL to source conversation for clickable provenance links */
  sourceUrl: string | null
  /** Actual capture timestamp for recency-based conflict resolution */
  capturedAt: string | null
  /** Array of memory item IDs this item was derived/merged from */
  derivedFrom: string[] | null
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

/** An entry in the objective history log (capped at 5) */
export interface ObjectiveHistoryEntry {
  objective: string
  /** ISO timestamp when this objective was replaced */
  replacedAt: string
  /** Source that caused the replacement: digest session ID, 'manual', or null */
  replacedBy: string | null
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
  /** Last 5 previous objectives for rollback */
  objectiveHistory: ObjectiveHistoryEntry[]
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

export interface WorkSessionRow {
  id: string
  projectId: string
  userId: string
  workspaceId: string | null
  surface: WorkSessionSurface
  threadId: string | null
  agentName: string | null
  clientName: string | null
  associationMethod: string | null
  associationConfidence: number | null
  baseSyncMarkAt: string | null
  latestSummary: string | null
  latestStructuredState: Record<string, unknown>
  status: WorkSessionStatus
  startedAt: string
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkSessionEventRow {
  id: string
  workSessionId: string
  projectId: string
  userId: string
  eventType: string
  payload: Record<string, unknown>
  sourceSurface: WorkSessionSurface
  sourceUrl: string | null
  sourceThreadId: string | null
  createdAt: string
}

export interface WorkSessionCheckpointRow {
  id: string
  workSessionId: string
  projectId: string
  userId: string
  summaryShort: string | null
  structuredState: Record<string, unknown>
  sourceEventIds: string[]
  confidence: number | null
  createdAt: string
}

export interface WorkSessionCheckpointWithSessionRow extends WorkSessionCheckpointRow {
  surface: WorkSessionSurface
  threadId: string | null
  agentName: string | null
  clientName: string | null
  associationConfidence: number | null
  sessionStatus: WorkSessionStatus
  sessionStartedAt: string
  sessionEndedAt: string | null
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
   purpose: ExtensionApiTokenPurpose
  tokenHash: string
  tokenPrefix: string
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
  revokedAt: string | null
}

export interface SurfaceSyncMarkRow {
  id: string
  projectId: string
  userId: string
  surface: SyncSurface
  lastSyncAt: string
  createdAt: string
  updatedAt: string
}

export interface McpTokenRow {
  id: string
  userId: string
  projectId: string
  tokenHash: string
  tokenPrefix: string
  scopes: McpTokenScope[]
  expiresAt: string
  refreshTokenHash: string | null
  refreshTokenPrefix: string | null
  refreshExpiresAt: string | null
  lastUsedAt: string | null
  rotationCount: number
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface McpAuthSessionRow {
  id: string
  sessionCode: string
  sessionHash: string
  sessionPrefix: string
  codeChallenge: string
  projectId: string
  scopes: McpTokenScope[]
  userId: string | null
  status: "pending" | "approved" | "exchanging" | "exchanged" | "expired"
  expiresAt: string
  approvedAt: string | null
  createdAt: string
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

export interface BillingCustomerRow {
  userId: string
  provider: "polar"
  providerCustomerId: string | null
  externalCustomerId: string
  email: string | null
  name: string | null
  trialClaimedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SubscriptionRow {
  id: string
  userId: string
  provider: "polar"
  providerSubscriptionId: string
  providerCustomerId: string | null
  productId: string | null
  planKey: "free" | "pro"
  status: "inactive" | "trialing" | "active" | "past_due" | "canceled"
  interval: "month" | "year" | null
  cancelAtPeriodEnd: boolean
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  trialStartsAt: string | null
  trialEndsAt: string | null
  raw: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface EntitlementRow {
  userId: string
  planKey: "free" | "pro"
  status: "inactive" | "trialing" | "active" | "past_due" | "canceled"
  providerCustomerId: string | null
  providerSubscriptionId: string | null
  interval: "month" | "year" | null
  activeProjectsLimit: number
  historyRetentionDays: number
  captureLimitMonthly: number
  mcpReadLimitDaily: number
  mcpWriteLimitDaily: number
  handoffEnabled: boolean
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  updatedAt: string
}

export interface UsageCounterRow {
  id: string
  scopeKey: string
  featureKey: string
  windowKey: string
  windowStart: string
  windowEnd: string
  count: number
  updatedAt: string
}

export interface BillingWebhookEventRow {
  id: string
  provider: "polar"
  providerEventId: string
  eventType: string
  payload: Record<string, unknown>
  status: "pending" | "processed" | "failed"
  errorMessage: string | null
  processedAt: string | null
  createdAt: string
  updatedAt: string
}
