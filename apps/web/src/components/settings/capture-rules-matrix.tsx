"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import ClaudeIcon from "@lobehub/icons/es/Claude"
import CodexIcon from "@lobehub/icons/es/Codex"
import DeepSeekIcon from "@lobehub/icons/es/DeepSeek"
import GeminiIcon from "@lobehub/icons/es/Gemini"
import GrokIcon from "@lobehub/icons/es/Grok"
import OpenAIIcon from "@lobehub/icons/es/OpenAI"
import PerplexityIcon from "@lobehub/icons/es/Perplexity"

import type { SupportedPlatform } from "@relay/shared"
import { effectiveAutoCapture, effectiveInlineChip } from "@relay/shared/utils/capture-settings"

import { cn } from "@/lib/cn"
import { createClientFlowId } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

export interface CaptureProjectSettings {
  id: string
  name: string
  kind: "project" | "personal"
  autoCapture?: boolean | null
  autoCapturePlatforms?: Partial<Record<SupportedPlatform, boolean>> | null
  inlineChip?: boolean | null
  inlineChipPlatforms?: Partial<Record<SupportedPlatform, boolean>> | null
}

type PlatformIcon = React.ComponentType<{ size?: number; className?: string }>

const PLATFORMS: ReadonlyArray<{ key: SupportedPlatform; label: string; icon: PlatformIcon }> = [
  { key: "chatgpt", label: "ChatGPT", icon: OpenAIIcon as PlatformIcon },
  { key: "claude", label: "Claude", icon: ClaudeIcon as PlatformIcon },
  { key: "gemini", label: "Gemini", icon: GeminiIcon as PlatformIcon },
  { key: "grok", label: "Grok", icon: GrokIcon as PlatformIcon },
  { key: "perplexity", label: "Perplexity", icon: PerplexityIcon as PlatformIcon },
  { key: "deepseek", label: "DeepSeek", icon: DeepSeekIcon as PlatformIcon },
  { key: "codex", label: "Codex", icon: CodexIcon as PlatformIcon },
]

type Tri = "on" | "off" | "mixed"

/** Cycle a tri-state on toggle: anything not fully on -> on, on -> off. */
function nextValue(tri: Tri): boolean {
  return tri !== "on"
}

interface Axis {
  getProjectValue: (p: CaptureProjectSettings) => boolean | null | undefined
  getProjectPlatforms: (
    p: CaptureProjectSettings,
  ) => Partial<Record<SupportedPlatform, boolean>> | null | undefined
  resolve: typeof effectiveAutoCapture
}

function TriCheckbox({
  tri,
  disabled,
  ariaLabel,
  onToggle,
}: {
  tri: Tri
  disabled?: boolean
  ariaLabel: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={tri === "on" ? "true" : tri === "off" ? "false" : "mixed"}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        tri === "on"
          ? "border-emerald-500 bg-emerald-500 text-white"
          : tri === "mixed"
            ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
            : "border-[var(--relay-line-strong)] bg-transparent text-transparent",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      {tri === "on" ? (
        <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
      ) : tri === "mixed" ? (
        <span className="h-[2px] w-2.5 rounded-full bg-current" />
      ) : null}
    </button>
  )
}

function CaptureTree({
  title,
  hint,
  global,
  projects,
  disabled,
  axis,
  onSetGlobal,
  onSetProject,
  onSetPlatform,
}: {
  title: string
  hint: string
  global: boolean
  projects: CaptureProjectSettings[]
  disabled: boolean
  axis: Axis
  onSetGlobal: (value: boolean) => void
  onSetProject: (project: CaptureProjectSettings, value: boolean) => void
  onSetPlatform: (project: CaptureProjectSettings, platform: SupportedPlatform, value: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({})

  const platformValue = (project: CaptureProjectSettings, platform: SupportedPlatform) =>
    axis.resolve({
      platform,
      global,
      project: axis.getProjectValue(project),
      projectPlatforms: axis.getProjectPlatforms(project),
    })

  const projectTri = (project: CaptureProjectSettings): Tri => {
    const values = PLATFORMS.map((p) => platformValue(project, p.key))
    if (values.every(Boolean)) return "on"
    if (values.every((v) => !v)) return "off"
    return "mixed"
  }

  const globalTri = (): Tri => {
    if (projects.length === 0) return global ? "on" : "off"
    const tris = projects.map(projectTri)
    if (tris.every((t) => t === "on")) return "on"
    if (tris.every((t) => t === "off")) return "off"
    return "mixed"
  }

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-0.5 text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
        >
          <ChevronDown
            className="size-3.5 transition-transform"
            style={{ transform: expanded ? "rotate(180deg)" : undefined }}
          />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-[var(--relay-ink)]">{title}</p>
          <p className="mt-0.5 text-sm text-[var(--relay-muted)]">{hint}</p>
        </div>
        <TriCheckbox
          tri={globalTri()}
          disabled={disabled}
          ariaLabel={`${title} (all projects)`}
          onToggle={() => onSetGlobal(nextValue(globalTri()))}
        />
      </div>

      {expanded ? (
        <div className="mt-2 ml-7 space-y-1 border-l border-[var(--relay-line)] pl-3">
          {projects.map((project) => {
            const open = openProjects[project.id] ?? false
            return (
              <div key={project.id}>
                <div className="flex items-center gap-2 py-1">
                  <button
                    type="button"
                    aria-label={open ? "Collapse" : "Expand"}
                    aria-expanded={open}
                    onClick={() => setOpenProjects((c) => ({ ...c, [project.id]: !open }))}
                    className="shrink-0 rounded p-0.5 text-[var(--relay-faint)] hover:text-[var(--relay-ink)]"
                  >
                    <ChevronDown
                      className="size-3 transition-transform"
                      style={{ transform: open ? "rotate(180deg)" : undefined }}
                    />
                  </button>
                  <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--relay-ink)]">
                    {project.name}
                    {project.kind === "personal" ? (
                      <span className="ml-2 rounded-full bg-[var(--relay-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--relay-muted)]">
                        Personal
                      </span>
                    ) : null}
                  </span>
                  <TriCheckbox
                    tri={projectTri(project)}
                    disabled={disabled}
                    ariaLabel={`${title} for ${project.name}`}
                    onToggle={() => onSetProject(project, nextValue(projectTri(project)))}
                  />
                </div>

                {open ? (
                  <div className="ml-5 space-y-0.5 border-l border-[var(--relay-line)] pl-3">
                    {PLATFORMS.map((platform) => {
                      const Icon = platform.icon
                      const on = platformValue(project, platform.key)
                      return (
                        <label
                          key={platform.key}
                          className="flex cursor-pointer items-center gap-2 py-1 text-[13px] text-[var(--relay-ink-secondary)]"
                        >
                          <Icon size={14} className="shrink-0" />
                          <span className="flex-1">{platform.label}</span>
                          <TriCheckbox
                            tri={on ? "on" : "off"}
                            disabled={disabled}
                            ariaLabel={`${title} for ${project.name} on ${platform.label}`}
                            onToggle={() => onSetPlatform(project, platform.key, !on)}
                          />
                        </label>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function CaptureRulesMatrix({
  initialProjects,
  globalAutoCapture,
  globalInlineChip,
  onSetGlobalAutoCapture,
  onSetGlobalInlineChip,
  disabled,
}: {
  initialProjects: CaptureProjectSettings[]
  globalAutoCapture: boolean
  globalInlineChip: boolean
  onSetGlobalAutoCapture: (value: boolean) => void
  onSetGlobalInlineChip: (value: boolean) => void
  disabled?: boolean
}) {
  // Personal pinned first, then the rest in their incoming order.
  const [projects, setProjects] = useState<CaptureProjectSettings[]>(() =>
    [...initialProjects].sort((a, b) =>
      a.kind === "personal" ? -1 : b.kind === "personal" ? 1 : 0,
    ),
  )
  const [busy, setBusy] = useState(false)

  async function patchProject(
    projectId: string,
    patch: {
      autoCapture?: boolean
      autoCapturePlatforms?: Partial<Record<SupportedPlatform, boolean>> | null
      inlineChip?: boolean
      inlineChipPlatforms?: Partial<Record<SupportedPlatform, boolean>> | null
    },
  ) {
    // Optimistic local update so the tri-state reflects immediately.
    setProjects((current) =>
      current.map((p) => (p.id === projectId ? { ...p, ...patch } : p)),
    )
    setBusy(true)
    try {
      await relayClientFetch(`/api/projects/${projectId}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        telemetry: {
          surface: "web-dashboard",
          area: "settings",
          event: "settings.project_capture_save",
          flowId: createClientFlowId("settings"),
        },
        body: JSON.stringify(patch),
      })
    } finally {
      setBusy(false)
    }
  }

  const autoAxis: Axis = {
    getProjectValue: (p) => p.autoCapture,
    getProjectPlatforms: (p) => p.autoCapturePlatforms,
    resolve: effectiveAutoCapture,
  }
  const chipAxis: Axis = {
    getProjectValue: (p) => p.inlineChip,
    getProjectPlatforms: (p) => p.inlineChipPlatforms,
    resolve: effectiveInlineChip,
  }

  const treeDisabled = Boolean(disabled) || busy

  return (
    <div className="divide-y divide-[var(--relay-line)]">
      <CaptureTree
        title="Auto-capture"
        hint="Quietly capture useful turns. Expand to override per project, then per site."
        global={globalAutoCapture}
        projects={projects}
        disabled={treeDisabled}
        axis={autoAxis}
        onSetGlobal={onSetGlobalAutoCapture}
        onSetProject={(project, value) =>
          void patchProject(project.id, { autoCapture: value, autoCapturePlatforms: null })
        }
        onSetPlatform={(project, platform, value) =>
          void patchProject(project.id, {
            autoCapturePlatforms: { ...(project.autoCapturePlatforms ?? {}), [platform]: value },
          })
        }
      />
      <CaptureTree
        title="Auto-show inline chip"
        hint="Show the chip on new chats. Expand to override per project, then per site. When off, press ⌘⇧I to summon it."
        global={globalInlineChip}
        projects={projects}
        disabled={treeDisabled}
        axis={chipAxis}
        onSetGlobal={onSetGlobalInlineChip}
        onSetProject={(project, value) =>
          void patchProject(project.id, { inlineChip: value, inlineChipPlatforms: null })
        }
        onSetPlatform={(project, platform, value) =>
          void patchProject(project.id, {
            inlineChipPlatforms: { ...(project.inlineChipPlatforms ?? {}), [platform]: value },
          })
        }
      />
    </div>
  )
}
