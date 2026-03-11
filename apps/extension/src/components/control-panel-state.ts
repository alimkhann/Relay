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
        heroBadge = "Bootstrap ready"
      } else if (digestStatus === "failed") {
        heroBadge = "Digest failed"
      } else if (digestStatus === "timed_out") {
        heroBadge = "Digest timed out"
      } else if (input.stateStatus?.rawCapturePresent || activeDigest) {
        heroBadge = "Digest pending"
      } else {
        heroBadge = "Capture needed"
      }
    } else if (input.supported) {
      heroBadge = "Ready on this chat"
    }
  }

  let projectHint = "Relay will watch for a meaningful capture and keep the next clean handoff ready."
  if (input.freshChat) {
    if (freshBootstrapReady) {
      projectHint = "Relay can drop a full bootstrap into this new chat."
    } else if (input.stateStatus?.digestStatus === "failed") {
      projectHint = "Digest failed. Capture the source chat again or wait for the next successful digest."
    } else if (input.stateStatus?.digestStatus === "timed_out") {
      projectHint = "Digest timed out. Relay can retry before the next bootstrap is inserted."
    } else if (input.stateStatus?.rawCapturePresent || activeDigest) {
      projectHint = "Relay is still building project state before this fresh-chat bootstrap is ready."
    } else {
      projectHint = "Capture a meaningful source chat first so Relay has project state to restore here."
    }
  } else if (projectStateReady) {
    projectHint = "Relay keeps state nearby and can insert a smaller continuity packet on demand."
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
