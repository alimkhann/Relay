import type { ProjectStateStatusDto, RelayOnboardingState } from "@relay/shared"

import type {
  RelayActiveProjectState,
  RelayAssociationTier,
  RelayAssociationToastState,
  RelayChatAssociation,
  RelayContextPreview,
  RelayInsertState,
  RelayInsertKind,
  RelayIssue,
  RelayPageState,
  RelayProjectOption,
  RelayRemoteStatus,
  RelayRoutingReview,
  RelaySidebarViewState,
  RelayTrustMetadata
} from "../messaging/contracts"

export const RELAY_SHORTCUT_LABEL = "Mod+Shift+I"

export interface BuildRelayActiveProjectStateInput {
  connected: boolean
  projectId: string | null
  projectName: string | null
  projectOptions: RelayProjectOption[]
  showCue: boolean
  page: RelayPageState
  onboarding: RelayOnboardingState
  stateStatus: ProjectStateStatusDto | null
  trust: RelayTrustMetadata
  remoteStatus: RelayRemoteStatus
  lastSuccessfulSyncAt: string | null
  capturePending: boolean
  contextPreview: RelayContextPreview
  chatAssociation: RelayChatAssociation
  routingReview: RelayRoutingReview | null
  associationTier: RelayAssociationTier
  associationToast: RelayAssociationToastState
  associationSuppressed: boolean
  insertState: RelayInsertState
  lastError?: string | null
}

export interface AutoCaptureDecisionInput {
  page: RelayPageState
  capturePending: boolean
  lastCapturedSignature: string | null
  lastCapturedTurns: number
}

export interface ShortcutDecisionInput {
  chipVisible: boolean
  dismissed: boolean
  page: RelayPageState
}

export function createEmptyTrustMetadata(): RelayTrustMetadata {
  return {
    updatedAt: null,
    updatedLabel: null,
    recentChatCount: 0,
    savedContextCount: 0
  }
}

export function createEmptyContextPreview(): RelayContextPreview {
  return {
    decisions: [],
    constraints: [],
    tasks: []
  }
}

export function createEmptyChatAssociation(): RelayChatAssociation {
  return {
    status: "none",
    projectId: null,
    projectName: null,
    sessionId: null,
    reason: null,
    capturedAt: null
  }
}

export function createEmptyAssociationToast(): RelayAssociationToastState {
  return {
    visible: false,
    mode: null,
    projectId: null,
    projectName: null,
    projectOptions: [],
    sessionId: null,
    expiresAt: null,
    paused: false
  }
}

export function createEmptyInsertState(): RelayInsertState {
  return {
    status: "idle",
    source: null,
    message: null,
    updatedAt: null
  }
}

export function createEmptyActiveProjectState(
  overrides: Partial<RelayActiveProjectState> = {}
): RelayActiveProjectState {
  return {
    projectId: null,
    projectName: null,
    projectOptions: [],
    viewState: "unsupported",
    showCue: true,
    status: "unavailable",
    message: "Open ChatGPT, Claude, Codex, or Perplexity to use Relay.",
    trustLine: "Built from recent chats and saved project context",
    freshnessText: null,
    shortcutLabel: RELAY_SHORTCUT_LABEL,
    canInsert: false,
    page: { supported: false },
    trust: createEmptyTrustMetadata(),
    remoteStatus: "unavailable",
    issue: null,
    insertKind: "fresh_chat_bootstrap",
    lastSuccessfulSyncAt: null,
    capturePending: false,
    contextPreview: createEmptyContextPreview(),
    chatAssociation: createEmptyChatAssociation(),
    routingReview: null,
    associationTier: "none",
    associationToast: createEmptyAssociationToast(),
    associationSuppressed: false,
    insertState: createEmptyInsertState(),
    onboarding: {
      status: "pending",
      completedProjectId: null,
      completedVia: null,
      completedAt: null
    },
    ...overrides
  }
}

export function looksLikeFreshChatRoute(page: RelayPageState) {
  const pathname = page.pathname ?? "/"

  if (page.platform === "claude") {
    return pathname.includes("/new")
  }

  if (page.platform === "chatgpt" || page.platform === "codex" || page.platform === "perplexity") {
    return pathname === "/"
  }

  return false
}

export function inferInsertKind(page: RelayPageState): RelayInsertKind {
  return page.isFreshChat ? "fresh_chat_bootstrap" : "quick_continuity"
}

function isActiveDigest(status: ProjectStateStatusDto | null) {
  return status?.activeJobStatus === "pending" || status?.activeJobStatus === "running"
}

function describeDigestIssue(status: ProjectStateStatusDto | null, insertKind: RelayInsertKind) {
  if (!status) {
    return insertKind === "fresh_chat_bootstrap"
      ? "Relay needs another recent chat before the project brief is ready."
      : "Relay needs a more recent chat update before the continuation brief is ready."
  }

  if (status.digestStatus === "failed") {
    return status.digestErrorMessage ?? "Relay could not finish the latest update."
  }

  if (status.digestStatus === "timed_out") {
    return status.digestErrorMessage ?? "Relay is retrying the latest update."
  }

  if (status.digestStatus === "running" || status.digestStatus === "pending" || status.rawCapturePresent) {
    return insertKind === "fresh_chat_bootstrap"
      ? "Relay is updating your project brief from recent chats."
      : "Relay is updating the continuation brief from the latest chat turns."
  }

  return insertKind === "fresh_chat_bootstrap"
    ? "Relay needs another recent chat before the project brief is ready."
    : "Relay needs a more recent chat update before the continuation brief is ready."
}

export function deriveRelayIssue(input: BuildRelayActiveProjectStateInput): RelayIssue | null {
  const insertKind = inferInsertKind(input.page)

  if (!input.page.supported) {
    return {
      kind: "unsupported",
      detail: "Open ChatGPT, Claude, Codex, or Perplexity to use Relay.",
      recoverable: false
    }
  }

  if (!input.projectId) {
    return {
      kind: "missing_project",
      detail: "Choose a project to keep this chat ready.",
      recoverable: true
    }
  }

  if (input.page.promptReady === false) {
    return {
      kind: "prompt",
      detail: "The chat composer is still loading.",
      recoverable: true
    }
  }

  if ((input.remoteStatus === "stale" || input.remoteStatus === "unavailable") && input.lastError) {
    return {
      kind: "network",
      detail: input.lastError,
      recoverable: true
    }
  }

  const projectStateReady = Boolean(input.stateStatus?.projectStateReady)
  if (!projectStateReady) {
    return {
      kind: "digest",
      detail: describeDigestIssue(input.stateStatus, insertKind),
      recoverable: input.stateStatus?.digestStatus !== "failed"
    }
  }

  return null
}

function deriveViewState(input: BuildRelayActiveProjectStateInput): RelaySidebarViewState {
  if (!input.connected) {
    return "disconnected"
  }

  if (input.onboarding.status === "pending") {
    return "connected-empty"
  }

  if (!input.page.supported) {
    return "unsupported"
  }

  if (
    input.remoteStatus === "ready" ||
    (input.remoteStatus === "stale" &&
      Boolean(input.lastSuccessfulSyncAt) &&
      (Boolean(input.projectId) || input.projectOptions.length > 0))
  ) {
    return input.projectOptions.length === 0 && !input.projectId
      ? "connected-empty"
      : "connected-ready"
  }

  return "connected-loading"
}

export function deriveRelayActiveProjectState(input: BuildRelayActiveProjectStateInput): RelayActiveProjectState {
  const insertKind = inferInsertKind(input.page)
  const projectStateReady = Boolean(input.stateStatus?.projectStateReady)
  const activeDigest = isActiveDigest(input.stateStatus)
  const issue = deriveRelayIssue(input)
  const viewState = deriveViewState(input)

  let status: RelayActiveProjectState["status"] = "unavailable"
  let message = "Open a supported AI chat to use Relay."
  let canInsert = false

  if (!input.connected) {
    message = "Sign in once to keep your project ready."
  } else if (!input.page.supported) {
    message = "Open ChatGPT, Claude, Codex, or Perplexity to use Relay."
  } else if (viewState === "connected-loading") {
    status = "updating"
    message = "Checking this chat…"
  } else if (!input.projectId) {
    message = "Choose a project to keep this chat ready."
  } else if (insertKind === "fresh_chat_bootstrap") {
    if (projectStateReady && !activeDigest) {
      status = "ready"
      message = "Ready for this chat"
      canInsert = input.page.promptReady !== false
    } else if (input.stateStatus?.digestStatus === "failed" || input.stateStatus?.digestStatus === "timed_out") {
      message = "Project brief unavailable"
    } else if (input.capturePending || input.remoteStatus === "loading" || activeDigest || input.stateStatus?.rawCapturePresent) {
      status = "updating"
      message = "Updating your project brief"
    } else {
      message = "Project brief unavailable"
    }
  } else if (projectStateReady) {
    status = "ready"
    message = "Ready for this chat"
    canInsert = input.page.promptReady !== false
  } else if (input.stateStatus?.digestStatus === "failed" || input.stateStatus?.digestStatus === "timed_out") {
    message = "Project brief unavailable"
  } else if (input.capturePending || input.remoteStatus === "loading" || activeDigest || input.stateStatus?.rawCapturePresent) {
    status = "updating"
    message = "Updating your project brief"
  } else {
    message = "Project brief unavailable"
  }

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    projectOptions: input.projectOptions,
    viewState,
    showCue: input.showCue,
    status,
    message,
    trustLine: "Built from recent chats and saved project context",
    freshnessText: input.trust.updatedLabel ? `Updated ${input.trust.updatedLabel}` : null,
    shortcutLabel: RELAY_SHORTCUT_LABEL,
    canInsert,
    page: input.page,
    trust: input.trust,
    remoteStatus: input.remoteStatus,
    issue,
    insertKind,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
    capturePending: input.capturePending,
    contextPreview: input.contextPreview,
    chatAssociation: input.chatAssociation,
    routingReview: input.routingReview,
    associationTier: input.associationTier,
    associationToast: input.associationToast,
    associationSuppressed: input.associationSuppressed,
    insertState: input.insertState,
    onboarding: input.onboarding
  }
}

export function shouldScheduleAutoCapture(input: AutoCaptureDecisionInput) {
  if (!input.page.supported) return false
  if (input.page.isFreshChat) return false
  if (!input.page.isStable) return false
  if (input.page.isStreaming) return false
  if ((input.page.turns ?? 0) === 0) return false
  if (!input.page.captureSignature) return false
  if (input.capturePending) return false

  return input.page.captureSignature !== input.lastCapturedSignature
}

export function decideShortcutAction(input: ShortcutDecisionInput) {
  if (!input.page.supported || input.page.promptReady === false) {
    return "no_op" as const
  }

  if (input.chipVisible) {
    return "trigger_visible_insert" as const
  }

  if (input.page.isFreshChat) {
    return input.dismissed ? ("restore_hidden_fresh" as const) : ("show_fresh_chip" as const)
  }

  return "show_existing_chip" as const
}
