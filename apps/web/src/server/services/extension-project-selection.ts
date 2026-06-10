import type { ProjectSummaryDto, RelayOnboardingState } from "@relay/shared"

/** Extension sessions should never default to the personal project. */
export function resolveExtensionSelectedProjectId(
  projects: Pick<ProjectSummaryDto, "id" | "kind">[],
  onboarding: Pick<RelayOnboardingState, "status" | "completedProjectId">,
): string {
  const firstSelectable = projects.find((project) => project.kind !== "personal")
  if (onboarding.status !== "completed") return ""

  const completedProject = onboarding.completedProjectId
    ? projects.find((project) => project.id === onboarding.completedProjectId)
    : null
  if (completedProject && completedProject.kind !== "personal") {
    return completedProject.id
  }
  return firstSelectable?.id ?? ""
}