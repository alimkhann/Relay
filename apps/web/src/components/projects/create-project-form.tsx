"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { slugify } from "@relay/shared/utils/text"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

export function CreateProjectForm({
  onSuccess,
  initialName = "",
  initialDescription = "",
  initialProjectUrl = "",
}: {
  onSuccess?: () => void
  initialName?: string
  initialDescription?: string
  initialProjectUrl?: string
} = {}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [projectUrl, setProjectUrl] = useState(initialProjectUrl)
  const [pending, setPending] = useState(false)
  const [scanPending, setScanPending] = useState(false)
  const [status, setStatus] = useState("Create a project once, then let Relay keep the next fresh chat ready.")

  async function scanProjectUrl() {
    const url = projectUrl.trim()
    if (!url) {
      setStatus("Enter a project URL to scan.")
      return
    }

    setScanPending(true)
    setStatus("Scanning project URL…")
    try {
      const response = await relayClientFetch("/api/projects/scan-url", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ url }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? "URL scan failed.")
      }

      const result = (await response.json()) as {
        name: string | null
        description: string | null
        url: string
      }

      setProjectUrl(result.url)
      if (!name.trim() && result.name) setName(result.name)
      if (!description.trim() && result.description) setDescription(result.description)
      setStatus("Project URL scanned.")
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "URL scan failed.")
    } finally {
      setScanPending(false)
    }
  }

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
    let receivedResponse = false
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
          description: description.trim() || null,
          projectUrl: projectUrl.trim() || null
        })
      })
      receivedResponse = true

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
      onSuccess?.()
      router.push(`/dashboard?project=${result.project.id}`)
      router.refresh()
    } catch (cause) {
      if (!receivedResponse) {
        logClientEvent({
          level: "error",
          surface: "web-dashboard",
          area: "projects",
          event: "project_create.failed",
          flowId,
          message: "Project creation failed before the projects API responded.",
          context: {
            failureStage: "request",
          },
          error: cause
        })
      }
      setStatus(cause instanceof Error ? cause.message : "Project creation failed.")
      setPending(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="space-y-6">
        <label className="block space-y-2">
          <span className="text-sm font-medium flex items-baseline gap-2">
            <span className="text-[var(--relay-ink)]">Project URL</span>
            <span className="text-xs text-[var(--relay-muted)] font-normal">Optional</span>
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="https://example.com"
              value={projectUrl}
              onChange={(event) => setProjectUrl(event.target.value)}
              disabled={pending || scanPending}
              type="url"
            />
            <Button
              disabled={pending || scanPending || !projectUrl.trim()}
              onClick={() => void scanProjectUrl()}
              type="button"
              variant="secondary"
            >
              {scanPending ? "Scanning…" : "Scan"}
            </Button>
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--relay-ink)]">Name</span>
          <Input
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
          <Textarea
            className="min-h-24 resize-y"
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
