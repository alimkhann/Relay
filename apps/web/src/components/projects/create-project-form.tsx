"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

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

    const slug = slugify(trimmedName)

    if (slug.length < 2) {
      setStatus("Project name needs at least two letters or numbers.")
      return
    }

    setPending(true)
    setStatus("Creating project…")

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: trimmedName,
          slug,
          description: description.trim() || null
        })
      })

      if (!response.ok) {
        throw new Error("Project creation failed.")
      }

      const result = (await response.json()) as {
        project: {
          id: string
        }
      }

      router.push(`/projects/${result.project.id}`)
      router.refresh()
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Project creation failed.")
      setPending(false)
    }
  }

  return (
    <div className="rounded-[20px] border border-[var(--relay-line)] bg-white/84 p-6 shadow-[var(--relay-shadow)]">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">Create project</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--relay-ink)]">Give Relay a project to hold onto.</h2>
      <p className="mt-3 text-sm leading-7 text-[var(--relay-muted)]">
        Start with a name and optional one-line description. Relay uses this as the durable home for digests, project state, and bootstrap packets.
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
