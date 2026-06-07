import type { ProjectStateStatusDto } from "@relay/shared"
import type { RelayChatAssociation, RelayProjectOption } from "../messaging/contracts"

interface ControlPanelStateInput {
  connected: boolean
  supported: boolean
  freshChat: boolean
  stateStatus: ProjectStateStatusDto | null
}

function isActiveDigest(status: ProjectStateStatusDto | null) {
  return status?.activeJobStatus === "pending" || status?.activeJobStatus === "running"
}

export function resolvePanelProjectOptions(
  activeOptions: RelayProjectOption[],
  sessionOptions: RelayProjectOption[],
) {
  const baseOptions = activeOptions.length > 0 ? activeOptions : sessionOptions
  if (baseOptions.some((project) => project.kind === "personal")) {
    return baseOptions
  }

  const personalProject = sessionOptions.find((project) => project.kind === "personal")
  return personalProject ? [personalProject, ...baseOptions] : baseOptions
}

function humanizeStage(stage: string | null | undefined) {
  if (!stage) return null

  const labels: Record<string, string> = {
    queued: "Queued",
    count_tokens_primary: "Counting tokens",
    generate_primary: "Generating",
    count_tokens_fallback: "Counting fallback tokens",
    generate_fallback: "Generating with fallback",
    merge_state: "Merging project state",
    completed: "Completed",
    failed: "Failed",
    timed_out: "Timed out"
  }

  return labels[stage] ?? stage.replaceAll("_", " ")
}

export interface AssociationCardPresentation {
  summary: string
  showMeta: boolean
}

export interface UnresolvedAssociationCardPresentation {
  summary: string
  detail: string
}

export function deriveAssociationCardPresentation(association: RelayChatAssociation): AssociationCardPresentation {
  if (association.status === "pending") {
    return {
      summary: `Relay is ready to save this chat to ${association.projectName ?? "the selected project"} unless you cancel the toast.`,
      showMeta: true,
    }
  }

  if (association.status === "held") {
    return {
      summary: association.reason?.includes("seeding its first chat context")
        ? `Relay is treating this as the first chat for ${association.projectName ?? "this project"} and is waiting for your approval.`
        : `Relay thinks this chat belongs to ${association.projectName ?? "this project"}, but it is waiting for your approval.`,
      showMeta: true,
    }
  }

  if (association.status === "saved") {
    return {
      summary: `This chat is currently associated with ${association.projectName ?? "the selected project"}.`,
      showMeta: true,
    }
  }

  if (association.status === "archived") {
    return {
      summary:
        "This chat was detached from the project. You can restore it if Relay should use it again.",
      showMeta: true,
    }
  }

  if (association.status === "ignored") {
    return {
      summary:
        association.reason ??
        "Relay will ignore this chat until you manually associate it.",
      showMeta: false,
    }
  }

  return {
    summary:
      association.reason ?? "Relay is leaving this chat out of automatic capture.",
    showMeta: Boolean(association.reason),
  }
}

export function shouldShowAssociationCard(input: {
  onboardingStatus: "pending" | "completed"
  supported: boolean
  freshChat: boolean
  turns: number
}) {
  return (
    input.onboardingStatus === "completed" &&
    input.supported &&
    !input.freshChat &&
    input.turns > 0
  )
}

export function deriveUnresolvedAssociationCardPresentation(input: {
  projectName: string | null
  checking: boolean
}): UnresolvedAssociationCardPresentation {
  if (input.checking) {
    return {
      summary: "Checking association…",
      detail: "Relay is loading the project signals it needs before deciding whether this chat belongs to a project.",
    }
  }

  return {
    summary: `This chat is not associated yet with ${input.projectName ?? "the selected project"}.`,
    detail:
      "Associate it manually if Relay should keep using this chat for carry-forward context and future briefs.",
  }
}

export function deriveControlPanelState(input: ControlPanelStateInput) {
  const activeDigest = isActiveDigest(input.stateStatus)
  const projectStateReady = Boolean(input.stateStatus?.projectStateReady)
  const digestStatus = input.stateStatus?.digestStatus ?? "idle"
  const freshBootstrapReady = input.freshChat && projectStateReady && !activeDigest

  let heroBadge: string | null = null
  if (input.connected) {
    if (input.freshChat) {
      if (freshBootstrapReady) {
        heroBadge = "Ready for this chat"
      } else if (digestStatus === "failed" || digestStatus === "timed_out") {
        heroBadge = "Project brief unavailable"
      } else if (input.stateStatus?.rawCapturePresent || activeDigest) {
        heroBadge = "Updating your project brief"
      } else {
        heroBadge = "Project brief unavailable"
      }
    } else if (input.supported) {
      heroBadge = projectStateReady ? "Ready for this chat" : "Updating your project brief"
    }
  }

  let projectHint = "Built from recent chats and saved project context."
  if (input.freshChat) {
    if (freshBootstrapReady) {
      projectHint = "Ready for this chat."
    } else if (input.stateStatus?.digestStatus === "failed" || input.stateStatus?.digestStatus === "timed_out") {
      projectHint = "Project brief unavailable until Relay learns from another recent chat."
    } else if (input.stateStatus?.rawCapturePresent || activeDigest) {
      projectHint = "Updating your project brief."
    } else {
      projectHint = "Project brief unavailable until Relay learns from another recent chat."
    }
  }

  const insertDisabled =
    !input.connected ||
    !input.supported ||
    (input.freshChat ? !freshBootstrapReady : !projectStateReady)

  return {
    activeDigest,
    freshBootstrapReady,
    heroBadge,
    insertDisabled,
    digestStatus,
    projectStateReady,
    stageLabel: humanizeStage(input.stateStatus?.activeJobStage),
    projectHint
  }
}
