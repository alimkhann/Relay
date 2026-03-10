import type { SiteAdapter } from "@relay/shared"

export abstract class BaseSiteAdapter implements SiteAdapter {
  abstract canHandle(url: string): boolean
  abstract getPlatform(): "chatgpt" | "perplexity" | "claude"
  abstract extractVisibleTurns(doc?: Document): ReturnType<SiteAdapter["extractVisibleTurns"]>
  abstract findPromptInput(doc?: Document): ReturnType<SiteAdapter["findPromptInput"]>
  abstract insertTextIntoPrompt(
    text: string,
    doc?: Document
  ): ReturnType<SiteAdapter["insertTextIntoPrompt"]>
  abstract getPageMetadata(doc?: Document): ReturnType<SiteAdapter["getPageMetadata"]>
}
