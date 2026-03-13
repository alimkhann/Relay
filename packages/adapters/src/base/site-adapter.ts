import type { SiteAdapter } from "@relay/shared/types/adapter"
import type { SupportedPlatform } from "@relay/shared/types/database"

export abstract class BaseSiteAdapter implements SiteAdapter {
  abstract canHandle(url: string): boolean
  abstract getPlatform(): SupportedPlatform
  abstract extractVisibleTurns(doc?: Document): ReturnType<SiteAdapter["extractVisibleTurns"]>
  abstract findPromptInput(doc?: Document): ReturnType<SiteAdapter["findPromptInput"]>
  abstract insertTextIntoPrompt(
    text: string,
    doc?: Document
  ): ReturnType<SiteAdapter["insertTextIntoPrompt"]>
  abstract getPageMetadata(doc?: Document): ReturnType<SiteAdapter["getPageMetadata"]>
}
