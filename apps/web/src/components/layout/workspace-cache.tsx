"use client"

import { useEffect, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import type { ProjectDashboardDto, UserSettingsRow } from "@relay/shared"

import { CreateProjectForm } from "@/components/projects/create-project-form"
import { SettingsPreferences } from "@/components/settings/settings-preferences"
import { ActivityFeed } from "@/features/activity/activity-feed"
import { DashboardContent } from "@/features/projects/dashboard-content"
import type { ActivityEntry } from "@/server/services/activity-service"

type DashboardSnapshot = {
  kind: "dashboard"
  cacheKey: string
  href: string
  project: { id: string; name: string; description?: string | null } | null
  dashboard: ProjectDashboardDto | null
}

type ActivitySnapshot = {
  kind: "activity"
  cacheKey: string
  href: string
  feed: ActivityEntry[]
}

type SettingsSnapshot = {
  kind: "settings"
  cacheKey: string
  href: string
  settings: UserSettingsRow["settings"]
  hasConnectedExtension: boolean
}

export type WorkspaceSnapshot =
  | DashboardSnapshot
  | ActivitySnapshot
  | SettingsSnapshot

interface PendingWorkspaceRoute {
  cacheKey: string
  href: string
  kind: WorkspaceSnapshot["kind"]
  projectId?: string | null
}

type WorkspaceStoreState = {
  cache: Map<string, WorkspaceSnapshot>
  pending: PendingWorkspaceRoute | null
  version: number
}

const workspaceStore: WorkspaceStoreState = {
  cache: new Map(),
  pending: null,
  version: 0,
}

const listeners = new Set<() => void>()
const refreshingKeys = new Set<string>()

function emitChange() {
  workspaceStore.version += 1
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return {
    version: workspaceStore.version,
    cache: workspaceStore.cache,
    pending: workspaceStore.pending,
  }
}

export function cacheWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  workspaceStore.cache.set(snapshot.cacheKey, snapshot)
  emitChange()
}

export function startWorkspaceNavigation(route: PendingWorkspaceRoute) {
  workspaceStore.pending = route
  emitChange()
}

export function clearWorkspaceNavigation(cacheKey?: string) {
  if (!workspaceStore.pending) return
  if (!cacheKey || workspaceStore.pending.cacheKey === cacheKey) {
    workspaceStore.pending = null
    emitChange()
  }
}

async function revalidateRoute(route: PendingWorkspaceRoute) {
  if (refreshingKeys.has(route.cacheKey)) return
  if (route.kind === "dashboard" && !route.projectId) return

  refreshingKeys.add(route.cacheKey)
  try {
    if (route.kind === "activity") {
      const response = await fetch("/api/activity", { credentials: "include" })
      if (!response.ok) return
      const payload = (await response.json()) as { feed: ActivitySnapshot["feed"] }
      cacheWorkspaceSnapshot({
        kind: "activity",
        cacheKey: route.cacheKey,
        href: route.href,
        feed: payload.feed,
      })
      return
    }

    if (route.kind === "settings") {
      const response = await fetch("/api/settings", { credentials: "include" })
      if (!response.ok) return
      const payload = (await response.json()) as {
        settings: { settings: UserSettingsRow["settings"] }
        hasConnectedExtension: boolean
      }
      cacheWorkspaceSnapshot({
        kind: "settings",
        cacheKey: route.cacheKey,
        href: route.href,
        settings: payload.settings.settings,
        hasConnectedExtension: payload.hasConnectedExtension,
      })
      return
    }

    const response = await fetch(`/api/projects/${route.projectId}`, {
      credentials: "include",
    })
    if (!response.ok) return
    const payload = (await response.json()) as {
      project: DashboardSnapshot["project"]
      dashboard: ProjectDashboardDto
    }
    cacheWorkspaceSnapshot({
      kind: "dashboard",
      cacheKey: route.cacheKey,
      href: route.href,
      project: payload.project,
      dashboard: payload.dashboard,
    })
  } finally {
    refreshingKeys.delete(route.cacheKey)
  }
}

function renderWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  if (snapshot.kind === "dashboard") {
    if (!snapshot.project || !snapshot.dashboard) {
      return (
        <section className="max-w-2xl py-10">
          <header className="mb-10 space-y-2">
            <h1 className="text-[28px] font-medium tracking-tight text-[var(--relay-ink)]">
              Welcome to Relay
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--relay-muted)]">
              Relay provides reliable, context-aware memory for your AI tools. Start by defining a project boundary.
            </p>
          </header>
          <CreateProjectForm />
        </section>
      )
    }

    return (
      <div className="pt-6">
        <DashboardContent project={snapshot.project} dashboard={snapshot.dashboard} />
      </div>
    )
  }

  if (snapshot.kind === "activity") {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
            Activity
          </h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Recent captures and digest runs across all projects.
          </p>
        </div>
        <ActivityFeed feed={snapshot.feed} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
        Settings
      </h1>
      <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
        Configure how Relay works across your chats.
      </p>
      <SettingsPreferences
        initialSettings={snapshot.settings}
        hasConnectedExtension={snapshot.hasConnectedExtension}
      />
    </div>
  )
}

function renderWorkspaceLoading(kind: WorkspaceSnapshot["kind"]) {
  const title =
    kind === "dashboard" ? "Overview" : kind === "activity" ? "Activity" : "Settings"

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
          {title}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">Loading…</p>
      </div>
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-[var(--relay-radius)] bg-[var(--relay-soft)]" />
        <div className="h-24 animate-pulse rounded-[var(--relay-radius)] bg-[var(--relay-soft)]" />
        <div className="h-24 animate-pulse rounded-[var(--relay-radius)] bg-[var(--relay-soft)]" />
      </div>
    </div>
  )
}

export function WorkspaceViewport({
  currentSnapshot,
  children,
}: {
  currentSnapshot: WorkspaceSnapshot
  children: ReactNode
}) {
  const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const pending = store.pending
  const pendingSnapshot =
    pending && pending.cacheKey !== currentSnapshot.cacheKey
      ? store.cache.get(pending.cacheKey)
      : null

  useEffect(() => {
    cacheWorkspaceSnapshot(currentSnapshot)
    clearWorkspaceNavigation(currentSnapshot.cacheKey)
  }, [currentSnapshot])

  useEffect(() => {
    if (!pending || pending.cacheKey === currentSnapshot.cacheKey) {
      return
    }

    const cached = store.cache.get(pending.cacheKey)
    if (!cached) {
      return
    }

    void revalidateRoute(pending)
  }, [currentSnapshot.cacheKey, pending, store.cache])

  if (pendingSnapshot) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--relay-muted)]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--relay-accent)]" />
          Refreshing…
        </div>
        {renderWorkspaceSnapshot(pendingSnapshot)}
      </div>
    )
  }

  if (pending && pending.cacheKey !== currentSnapshot.cacheKey) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--relay-muted)]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--relay-accent)]" />
          Loading…
        </div>
        {renderWorkspaceLoading(pending.kind)}
      </div>
    )
  }

  return <>{children}</>
}
