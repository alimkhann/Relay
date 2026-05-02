import type { BindingKind, SupportedPlatform } from "./database"
import type { ProjectSummaryDto } from "./project"

export interface ProjectBindingInput {
  projectId: string
  bindingKind: BindingKind
  domain?: string | null
  tabId?: string | null
  platform?: SupportedPlatform | null
}

export interface ProjectBindingResolveInput {
  domain?: string | null
  tabId?: string | null
  platform?: SupportedPlatform | null
}

export interface ResolvedProjectBindingDto {
  binding: {
    id: string
    bindingKind: BindingKind
    domain: string | null
    tabId: string | null
    platform: SupportedPlatform | null
    updatedAt: string
  }
  project: ProjectSummaryDto
}
