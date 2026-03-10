import type { BindingKind, SupportedPlatform } from "./database"

export interface ProjectBindingInput {
  projectId: string
  bindingKind: BindingKind
  domain?: string | null
  tabId?: string | null
  platform?: SupportedPlatform | null
}
