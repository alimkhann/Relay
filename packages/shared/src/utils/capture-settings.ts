import type { SupportedPlatform } from "../types/database"

/**
 * Resolution input for the two-axis capture/chip matrix. Resolution is
 * most-specific-wins: a present platform leaf overrides the project-level
 * value, which overrides the global user setting.
 */
export interface CaptureResolutionInput {
  /** Active platform; null when the page isn't a supported AI surface. */
  platform: SupportedPlatform | null
  /** Global user setting (autoCapture / showSidepanelOnSupportedSites). */
  global: boolean
  /** Project-level override; undefined/null = inherit global. */
  project?: boolean | null
  /** Per-(platform) overrides; a present leaf wins over `project`. */
  projectPlatforms?: Partial<Record<SupportedPlatform, boolean>> | null
}

function resolveLeafProjectGlobal(input: CaptureResolutionInput): boolean {
  const leaf = input.platform ? input.projectPlatforms?.[input.platform] : undefined
  if (typeof leaf === "boolean") return leaf
  if (typeof input.project === "boolean") return input.project
  return input.global
}

/** Effective auto-capture for a (project, platform) pair. */
export function effectiveAutoCapture(input: CaptureResolutionInput): boolean {
  return resolveLeafProjectGlobal(input)
}

/** Effective inline-chip visibility for a (project, platform) pair. */
export function effectiveInlineChip(input: CaptureResolutionInput): boolean {
  return resolveLeafProjectGlobal(input)
}
