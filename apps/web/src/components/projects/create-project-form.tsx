"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { slugify } from "@relay/shared/utils/text"

import { Button } from "@/components/ui/button"
import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

export function CreateProjectForm({ onSuccess, initialName = "", initialDescription = "" }: { onSuccess?: () => void; initialName?: string; initialDescription?: string } = {}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState("Create a project once, then let Relay keep the next fresh chat ready.")

  async function createProject() {
    const trimmedName = name.trim()

    if (trimmedName.length < 2) {
      setStatus("Project name must be at least 2 characters.")
      return
    }

    const slug = slugify(trimmedName).slice(0, 80)

    if (slug.length < 2) {
      setStatus("Project name needs at least two letters or numbers.")
      return
    }

    const flowId = createClientFlowId("project")
    setPending(true)
    setStatus("Creating project…")

    try {
      const response = await relayClientFetch("/api/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        telemetry: {
          surface: "web-dashboard",
          area: "projects",
          event: "project_create.submit",
          flowId,
          context: {
            source: "dashboard_form",
            nameLength: trimmedName.length
          },
          logSuccess: true
        },
        body: JSON.stringify({
          name: trimmedName,
          slug,
          description: description.trim() || null
        })
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error ?? "Project creation failed.")
      }

      const result = (await response.json()) as {
        project: {
          id: string
          slug: string
        }
      }

      logClientEvent({
        level: "info",
        surface: "web-dashboard",
        area: "projects",
        event: "project_create.succeeded",
        flowId,
        message: `Created project ${result.project.id}.`,
        context: {
          projectId: result.project.id,
          slug: result.project.slug
        }
      })
      onSuccess?.()
      router.push(`/dashboard?project=${result.project.id}`)
      router.refresh()
    } catch (cause) {
      logClientEvent({
        level: "error",
        surface: "web-dashboard",
        area: "projects",
        event: "project_create.failed",
        flowId,
        message: "Project creation failed from the dashboard form.",
        error: cause
      })
      setStatus(cause instanceof Error ? cause.message : "Project creation failed.")
      setPending(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="space-y-6">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--relay-ink)]">Name</span>
          <input
            className="w-full rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-transparent px-3 py-2 text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)]"
            placeholder="E.g., Acapella or Internal Tools"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
            autoFocus
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium flex items-baseline gap-2">
            <span className="text-[var(--relay-ink)]">Description</span>
            <span className="text-xs text-[var(--relay-muted)] font-normal">Optional</span>
          </span>
          <textarea
            className="min-h-24 w-full rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-transparent px-3 py-2 text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)] resize-y"
            placeholder="A short description of the project so Relay can route related chats correctly."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={pending}
            maxLength={200}
          />
          <div className="flex items-start justify-between gap-3 text-xs leading-relaxed text-[var(--relay-muted)]">
            <p>Recommended for project association and other features. You can change or add it later.</p>
            <span className="shrink-0 tabular-nums">{description.length}/200</span>
          </div>
        </label>
      </div>

      <div className="mt-8 flex flex-col items-start gap-3">
        <Button disabled={pending} onClick={() => void createProject()} variant="default">
          {pending ? "Creating…" : "Create"}
        </Button>
        {status && status !== "Create a project once, then let Relay keep the next fresh chat ready." && (
          <p className="text-xs text-[var(--relay-muted)]">{status}</p>
        )}
      </div>
    </div>
  )
}
