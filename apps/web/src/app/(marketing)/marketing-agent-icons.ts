import OpenAI from "@lobehub/icons/es/OpenAI"
import Claude from "@lobehub/icons/es/Claude"
import Gemini from "@lobehub/icons/es/Gemini"
import Grok from "@lobehub/icons/es/Grok"
import Perplexity from "@lobehub/icons/es/Perplexity"
import DeepSeek from "@lobehub/icons/es/DeepSeek"
import ClaudeCode from "@lobehub/icons/es/ClaudeCode"
import Cursor from "@lobehub/icons/es/Cursor"
import Codex from "@lobehub/icons/es/Codex"
import Antigravity from "@lobehub/icons/es/Antigravity"
import Windsurf from "@lobehub/icons/es/Windsurf"
import OpenCode from "@lobehub/icons/es/OpenCode"
import Trae from "@lobehub/icons/es/Trae"
import Amp from "@lobehub/icons/es/Amp"
import Cline from "@lobehub/icons/es/Cline"
import RooCode from "@lobehub/icons/es/RooCode"
import KiloCode from "@lobehub/icons/es/KiloCode"

import type { ComponentType } from "react"

export type MarqueeIconModule = {
  Avatar: ComponentType<{ size: number }>
}

/** Row 1: browser AI web apps. */
const BROWSER_AI_ICONS: MarqueeIconModule[] = [
  OpenAI,
  Claude,
  Gemini,
  Grok,
  Perplexity,
  DeepSeek,
]

/** Row 2: coding agents (advertised on marketing, with @lobehub/icons logos). */
const CODING_TOOL_ICONS: MarqueeIconModule[] = [
  ClaudeCode,
  Cursor,
  Codex,
  Windsurf,
  OpenCode,
  Trae,
  Antigravity,
  Amp,
  Cline,
  RooCode,
  KiloCode,
]

/** Row 3: mixed browser + coding. */
const MIXED_ICONS: MarqueeIconModule[] = [
  Grok,
  DeepSeek,
  ClaudeCode,
  OpenAI,
  Windsurf,
  Gemini,
  OpenCode,
  Cursor,
]

export const MARQUEE_ROWS: MarqueeIconModule[][] = [
  BROWSER_AI_ICONS,
  CODING_TOOL_ICONS,
  MIXED_ICONS,
]