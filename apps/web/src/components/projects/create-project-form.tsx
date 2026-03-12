"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { slugify } from "@relay/shared/utils/text"

import { Button } from "@/components/ui/button"
import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

export function CreateProjectForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
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
      router.push(`/projects/${result.project.id}`)
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
    <div className="rounded-[20px] border border-[var(--relay-line)] bg-white/84 p-6 shadow-[var(--relay-shadow)]">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Create project</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">Give Relay a project to hold onto.</h2>
      <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
        Start with a name and optional one-line description. Relay uses this as the durable home for saved context, recent chats, and project briefs.
      </p>

      <div className="mt-5 grid gap-4">
        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--relay-muted)]">Project name</span>
          <input
            className="w-full rounded-[18px] border border-[var(--relay-line)] bg-white px-4 py-3 text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)]"
            placeholder="Relay MVP"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--relay-muted)]">Description</span>
          <textarea
            className="min-h-24 w-full rounded-[18px] border border-[var(--relay-line)] bg-white px-4 py-3 text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)]"
            placeholder="Cross-AI project memory sidecar for browser workflows."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled={pending} onClick={() => void createProject()}>
          {pending ? "Creating…" : "Create project"}
        </Button>
        <p className="text-sm text-[var(--relay-muted)]">{status}</p>
      </div>
    </div>
  )
}
