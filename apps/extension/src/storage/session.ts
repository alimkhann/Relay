import type { ProjectStateStatusDto, RelayOnboardingState } from "@relay/shared"

import type { RelayTargetMode } from "../utils/target-profile"
import type { RelayProjectOption, RelayTrustMetadata } from "../messaging/contracts"

const storage = typeof chrome !== "undefined" ? chrome.storage.local : null

const keys = {
  apiBase: "relay.apiBase",
  token: "relay.authToken",
  userId: "relay.userId",
  projectId: "relay.projectId",
  targetMode: "relay.targetMode",
  targetProfileKey: "relay.targetProfileKey",
  resolvedTargetProfileKey: "relay.resolvedTargetProfileKey",
  connected: "relay.connected",
  autoCapture: "relay.autoCapture",
  limitedMode: "relay.limitedMode",
  lastStatus: "relay.lastStatus",
  stateStatus: "relay.stateStatus",
  assumedProjectId: "relay.assumedProjectId",
  assumedProjectName: "relay.assumedProjectName",
  trust: "relay.trust",
  projectOptions: "relay.projectOptions",
  onboarding: "relay.onboarding"
} as const

export function resolveRelayApiBase(options?: {
  storedApiBase?: string | null
  authProvider?: string | null
  configuredApiBase?: string | null
}) {
  const configuredApiBase =
    options?.configuredApiBase?.trim() ||
    process.env.PLASMO_PUBLIC_RELAY_API_BASE ||
    "http://localhost:3000"
  const storedApiBase = options?.storedApiBase?.trim() || ""
  const authProvider =
    options?.authProvider ??
    process.env.PLASMO_PUBLIC_RELAY_AUTH_PROVIDER ??
    "neon"

  if (authProvider === "local") {
    return configuredApiBase
  }

  return storedApiBase || configuredApiBase
}

function createPendingOnboardingState(): RelayOnboardingState {
  return {
    status: "pending",
    completedProjectId: null,
    completedVia: null,
    completedAt: null
  }
}

export interface RelaySessionState {
  apiBase: string
  token: string
  userId: string
  projectId: string
  targetMode: RelayTargetMode
  targetProfileKey: string
  resolvedTargetProfileKey: string
  connected: boolean
  autoCapture: boolean
  limitedMode: boolean
  lastStatus: string
  stateStatus: ProjectStateStatusDto | null
  assumedProjectId: string
  assumedProjectName: string
  trust: RelayTrustMetadata
  projectOptions: RelayProjectOption[]
  onboarding: RelayOnboardingState
}

export function normalizeRelaySession(values: Record<string, unknown>): RelaySessionState {
  const hasExplicitTargetMode = typeof values[keys.targetMode] === "string"
  const targetMode = (values[keys.targetMode] as RelayTargetMode | undefined) ?? "auto"
  const manualTargetProfileKey = hasExplicitTargetMode ? (values[keys.targetProfileKey] as string | undefined) ?? "" : ""

  return {
    apiBase: resolveRelayApiBase({
      storedApiBase: values[keys.apiBase] as string | undefined
    }),
    token: (values[keys.token] as string | undefined) ?? "",
    userId: (values[keys.userId] as string | undefined) ?? "",
    projectId: (values[keys.projectId] as string | undefined) ?? "",
    targetMode,
    targetProfileKey: manualTargetProfileKey,
    resolvedTargetProfileKey: (values[keys.resolvedTargetProfileKey] as string | undefined) ?? "",
    connected: Boolean(values[keys.connected]),
    autoCapture: (values[keys.autoCapture] as boolean | undefined) ?? true,
    limitedMode: Boolean(values[keys.limitedMode]),
    lastStatus: (values[keys.lastStatus] as string | undefined) ?? "",
    stateStatus: (values[keys.stateStatus] as ProjectStateStatusDto | undefined) ?? null,
    assumedProjectId: (values[keys.assumedProjectId] as string | undefined) ?? "",
    assumedProjectName: (values[keys.assumedProjectName] as string | undefined) ?? "",
    trust:
      (values[keys.trust] as RelayTrustMetadata | undefined) ?? {
        updatedAt: null,
        updatedLabel: null,
        recentChatCount: 0,
        savedContextCount: 0
      },
    projectOptions: Array.isArray(values[keys.projectOptions])
      ? (values[keys.projectOptions] as RelayProjectOption[])
      : [],
    onboarding:
      (values[keys.onboarding] as RelayOnboardingState | undefined) ?? createPendingOnboardingState()
  }
}

export async function getRelaySession() {
  if (!storage) {
    return {
      apiBase: resolveRelayApiBase(),
      token: "",
      userId: "",
      projectId: "",
      targetMode: "auto" as const,
      targetProfileKey: "",
      resolvedTargetProfileKey: "",
      connected: false,
      autoCapture: true,
      limitedMode: false,
      lastStatus: "",
      stateStatus: null,
      assumedProjectId: "",
      assumedProjectName: "",
      trust: {
        updatedAt: null,
        updatedLabel: null,
        recentChatCount: 0,
        savedContextCount: 0
      },
      projectOptions: [],
      onboarding: createPendingOnboardingState()
    }
  }

  const values = await storage.get(Object.values(keys))
  return normalizeRelaySession(values)
}

export async function setRelaySession(input: Partial<RelaySessionState>) {
  if (!storage) return

  const payload: Record<string, unknown> = {}

  if (input.apiBase !== undefined) payload[keys.apiBase] = input.apiBase
  if (input.token !== undefined) payload[keys.token] = input.token
  if (input.userId !== undefined) payload[keys.userId] = input.userId
  if (input.projectId !== undefined) payload[keys.projectId] = input.projectId
  if (input.targetMode !== undefined) payload[keys.targetMode] = input.targetMode
  if (input.targetProfileKey !== undefined) payload[keys.targetProfileKey] = input.targetProfileKey
  if (input.resolvedTargetProfileKey !== undefined) payload[keys.resolvedTargetProfileKey] = input.resolvedTargetProfileKey
  if (input.connected !== undefined) payload[keys.connected] = input.connected
  if (input.autoCapture !== undefined) payload[keys.autoCapture] = input.autoCapture
  if (input.limitedMode !== undefined) payload[keys.limitedMode] = input.limitedMode
  if (input.lastStatus !== undefined) payload[keys.lastStatus] = input.lastStatus
  if (input.stateStatus !== undefined) payload[keys.stateStatus] = input.stateStatus
  if (input.assumedProjectId !== undefined) payload[keys.assumedProjectId] = input.assumedProjectId
  if (input.assumedProjectName !== undefined) payload[keys.assumedProjectName] = input.assumedProjectName
  if (input.trust !== undefined) payload[keys.trust] = input.trust
  if (input.projectOptions !== undefined) payload[keys.projectOptions] = input.projectOptions
  if (input.onboarding !== undefined) payload[keys.onboarding] = input.onboarding

  if (Object.keys(payload).length > 0) {
    await storage.set(payload)
  }
}

export async function clearRelaySession() {
  if (!storage) return
  await storage.remove(Object.values(keys))
}
