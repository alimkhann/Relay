import type { PageMetadata, ParsedTurn } from "./capture"
import type { SupportedPlatform } from "./database"

export interface PromptTarget {
  element: HTMLElement
  isContentEditable: boolean
}

export interface InjectionResult {
  ok: boolean
  reason?: string
}

export interface SiteAdapter {
  canHandle(url: string): boolean
  getPlatform(): SupportedPlatform
  extractVisibleTurns(doc?: Document): ParsedTurn[]
  findPromptInput(doc?: Document): PromptTarget | null
  insertTextIntoPrompt(text: string, doc?: Document): Promise<InjectionResult>
  getPageMetadata(doc?: Document): PageMetadata
}
