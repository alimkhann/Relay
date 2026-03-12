import type { ProjectStateStatusDto } from "@relay/shared"

interface ControlPanelStateInput {
  connected: boolean
  supported: boolean
  freshChat: boolean
  stateStatus: ProjectStateStatusDto | null
}

function isActiveDigest(status: ProjectStateStatusDto | null) {
  return status?.activeJobStatus === "pending" || status?.activeJobStatus === "running"
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
