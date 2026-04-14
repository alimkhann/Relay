"use client"

import { useState, useTransition } from "react"
import type { ProjectSettingsDto } from "@relay/shared"

import { cn } from "@/lib/cn"

const AUTONOMY_OPTIONS: {
  value: ProjectSettingsDto["autonomyMode"]
  label: string
  hint: string
}[] = [
  {
    value: "conservative",
    label: "Conservative",
    hint: "Relay will only surface high-confidence context. Pending updates stay hidden until you lock them.",
  },
  {
    value: "standard",
    label: "Standard",
    hint: "Balanced default. Pending updates visible; context auto-promotes when evidence is strong.",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    hint: "Relay auto-promotes context eagerly, folds pending updates into briefs by default.",
  },
]

const COMPACTION_OPTIONS: {
  value: ProjectSettingsDto["compactionMode"]
  label: string
  hint: string
}[] = [
  { value: "light", label: "Light", hint: "Keep most raw memory; demote only obvious duplicates." },
  { value: "standard", label: "Standard", hint: "Demote memory once context or summary covers it." },
  { value: "aggressive", label: "Aggressive", hint: "Demote early; rely on context + summary for retrieval." },
]

export function ProjectSettingsForm({
  projectId,
  initial,
}: {
  projectId: string
  initial: ProjectSettingsDto
}) {
  const [settings, setSettings] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  function patch(update: Partial<ProjectSettingsDto>) {
    const next = { ...settings, ...update }
    setSettings(next)
    startTransition(async () => {
      setError(null)
      try {
        const res = await fetch(`/api/projects/${projectId}/settings`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(update),
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `HTTP ${res.status}`)
        }
        setSavedAt(Date.now())
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save")
        setSettings(settings)
      }
    })
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Autonomy</h2>
          <p className="text-[13px] text-[var(--relay-muted)]">
            How aggressively Relay maintains context on your behalf.
          </p>
        </header>
        <div className="grid gap-2">
          {AUTONOMY_OPTIONS.map((option) => (
            <RadioCard
              key={option.value}
              name="autonomyMode"
              value={option.value}
              checked={settings.autonomyMode === option.value}
              label={option.label}
              hint={option.hint}
              onChange={() => patch({ autonomyMode: option.value })}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Pending updates</h2>
          <p className="text-[13px] text-[var(--relay-muted)]">
            Control whether low-confidence context is shown or folded into generated briefs.
          </p>
        </header>
        <ToggleRow
          label="Show pending updates in dashboard"
          checked={settings.showTentativeUpdates}
          onChange={(checked) => patch({ showTentativeUpdates: checked })}
        />
        <ToggleRow
          label="Include pending updates in briefs"
          checked={settings.includeTentativeUpdatesInPackets}
          onChange={(checked) => patch({ includeTentativeUpdatesInPackets: checked })}
        />
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Compaction</h2>
          <p className="text-[13px] text-[var(--relay-muted)]">
            How aggressively raw memory is demoted once context or summaries cover it.
          </p>
        </header>
        <div className="grid gap-2">
          {COMPACTION_OPTIONS.map((option) => (
            <RadioCard
              key={option.value}
              name="compactionMode"
              value={option.value}
              checked={settings.compactionMode === option.value}
              label={option.label}
              hint={option.hint}
              onChange={() => patch({ compactionMode: option.value })}
            />
          ))}
        </div>
      </section>

      <footer className="flex items-center gap-3 text-[12px] text-[var(--relay-muted)]">
        {isPending ? <span>Saving…</span> : null}
        {!isPending && savedAt ? <span>Saved</span> : null}
        {error ? <span className="text-red-500">{error}</span> : null}
      </footer>
    </div>
  )
}

function RadioCard({
  name,
  value,
  checked,
  label,
  hint,
  onChange,
}: {
  name: string
  value: string
  checked: boolean
  label: string
  hint: string
  onChange: () => void
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[var(--relay-radius-sm)] border p-3 transition",
        checked
          ? "border-[var(--relay-ink)] bg-[var(--relay-soft)]"
          : "border-[var(--relay-line)] hover:border-[var(--relay-muted)]",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4"
      />
      <div>
        <p className="text-[13px] font-medium text-[var(--relay-ink)]">{label}</p>
        <p className="text-[12px] text-[var(--relay-muted)]">{hint}</p>
      </div>
    </label>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] p-3">
      <span className="text-[13px] text-[var(--relay-ink)]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4"
      />
    </label>
  )
}
