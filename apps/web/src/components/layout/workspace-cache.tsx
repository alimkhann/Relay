"use client"

import dynamic from "next/dynamic"
import { useEffect, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import type { ProjectDashboardDto, UserSettingsRow } from "@relay/shared"

import type { ActivityEntry } from "@/server/services/activity-service"

const WorkspaceDashboardView = dynamic(
  () =>
    import("@/components/layout/workspace-dashboard-view").then((module) => ({
      default: module.WorkspaceDashboardView
    })),
  { ssr: false }
)
const WorkspaceActivityView = dynamic(
  () =>
    import("@/components/layout/workspace-activity-view").then((module) => ({
      default: module.WorkspaceActivityView
    })),
  { ssr: false }
)
const WorkspaceSettingsView = dynamic(
  () =>
    import("@/components/layout/workspace-settings-view").then((module) => ({
      default: module.WorkspaceSettingsView
    })),
  { ssr: false }
)
const WorkspaceMemoryView = dynamic(
  () =>
    import("@/components/layout/workspace-memory-view").then((module) => ({
      default: module.WorkspaceMemoryView
    })),
  { ssr: false }
)
const WorkspaceBriefView = dynamic(
  () =>
    import("@/components/layout/workspace-brief-view").then((module) => ({
      default: module.WorkspaceBriefView
    })),
  { ssr: false }
)

type DashboardSnapshot = {
  kind: "dashboard"
  cacheKey: string
  href: string
  project: { id: string; name: string; description?: string | null }
  dashboard: ProjectDashboardDto
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

type MemorySnapshot = {
  kind: "memory"
  cacheKey: string
  href: string
  project: { id: string; name: string; description?: string | null }
  dashboard: ProjectDashboardDto
}

type BriefSnapshot = {
  kind: "brief"
  cacheKey: string
  href: string
  project: { id: string; name: string }
  dashboard: ProjectDashboardDto
}

export type WorkspaceSnapshot =
  | DashboardSnapshot
  | ActivitySnapshot
  | SettingsSnapshot
  | MemorySnapshot
  | BriefSnapshot

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
let cachedSnapshot = {
  version: workspaceStore.version,
  cache: workspaceStore.cache,
  pending: workspaceStore.pending,
}

function emitChange() {
  workspaceStore.version += 1
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  if (cachedSnapshot.version !== workspaceStore.version) {
    cachedSnapshot = {
      version: workspaceStore.version,
      cache: workspaceStore.cache,
      pending: workspaceStore.pending,
    }
  }

  return cachedSnapshot
}

function fingerprintWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  return JSON.stringify(snapshot)
}

export function cacheWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  const cached = workspaceStore.cache.get(snapshot.cacheKey)
  if (
    cached &&
    cached.kind === snapshot.kind &&
    cached.href === snapshot.href &&
    fingerprintWorkspaceSnapshot(cached) === fingerprintWorkspaceSnapshot(snapshot)
  ) {
    return
  }

  workspaceStore.cache.set(snapshot.cacheKey, snapshot)
  emitChange()
}

export function startWorkspaceNavigation(route: PendingWorkspaceRoute) {
  if (route.kind === "dashboard" && !route.projectId) {
    return
  }

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

export function getWorkspaceStoreVersionForTests() {
  return workspaceStore.version
}

export function resetWorkspaceStoreForTests() {
  workspaceStore.cache.clear()
  workspaceStore.pending = null
  workspaceStore.version = 0
  refreshingKeys.clear()
  listeners.clear()
  cachedSnapshot = {
    version: workspaceStore.version,
    cache: workspaceStore.cache,
    pending: workspaceStore.pending,
  }
}

async function revalidateRoute(route: PendingWorkspaceRoute) {
  if (refreshingKeys.has(route.cacheKey)) return
  if ((route.kind === "dashboard" || route.kind === "memory" || route.kind === "brief") && !route.projectId) return

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

    // dashboard, memory, and brief all use the project endpoint
    const response = await fetch(`/api/projects/${route.projectId}`, {
      credentials: "include",
    })
    if (!response.ok) return
    const payload = (await response.json()) as {
      project: DashboardSnapshot["project"]
      dashboard: ProjectDashboardDto
    }

    if (route.kind === "memory") {
      cacheWorkspaceSnapshot({
        kind: "memory",
        cacheKey: route.cacheKey,
        href: route.href,
        project: payload.project,
        dashboard: payload.dashboard,
      })
      return
    }

    if (route.kind === "brief") {
      cacheWorkspaceSnapshot({
        kind: "brief",
        cacheKey: route.cacheKey,
        href: route.href,
        project: { id: payload.project.id, name: payload.project.name },
        dashboard: payload.dashboard,
      })
      return
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
    return <WorkspaceDashboardView project={snapshot.project} dashboard={snapshot.dashboard} />
  }

  if (snapshot.kind === "activity") {
    return <WorkspaceActivityView feed={snapshot.feed} />
  }

  if (snapshot.kind === "memory") {
    return <WorkspaceMemoryView project={snapshot.project} dashboard={snapshot.dashboard} />
  }

  if (snapshot.kind === "brief") {
    return <WorkspaceBriefView project={snapshot.project} dashboard={snapshot.dashboard} />
  }

  return (
    <WorkspaceSettingsView
      settings={snapshot.settings}
      hasConnectedExtension={snapshot.hasConnectedExtension}
    />
  )
}

function renderWorkspaceLoading(kind: PendingWorkspaceRoute["kind"]) {
  const titleMap: Record<PendingWorkspaceRoute["kind"], string> = {
    dashboard: "Overview",
    activity: "Activity",
    settings: "Settings",
    memory: "Memory",
    brief: "Brief",
  }
  const title = titleMap[kind] ?? "Overview"

  function renderSkeleton() {
    if (kind === "dashboard") {
      return (
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="h-48 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]" />
            <div className="h-48 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]" />
          </div>
        </div>
      )
    }

    if (kind === "activity") {
      return (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-4">
              <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--relay-soft)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-[var(--relay-soft)]" />
                <div className="h-3 w-1/2 rounded bg-[var(--relay-soft)]" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (kind === "settings") {
      return (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-5 space-y-3">
              <div className="h-4 w-24 rounded bg-[var(--relay-soft)]" />
              <div className="h-3 w-48 rounded bg-[var(--relay-soft)]" />
            </div>
          ))}
        </div>
      )
    }

    // memory / brief
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-32 rounded bg-[var(--relay-soft)]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
          {title}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">Loading…</p>
      </div>
      {renderSkeleton()}
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
  const currentSnapshotFingerprint = fingerprintWorkspaceSnapshot(currentSnapshot)
  const pendingSnapshot =
    pending && pending.cacheKey !== currentSnapshot.cacheKey
      ? store.cache.get(pending.cacheKey)
      : null

  useEffect(() => {
    cacheWorkspaceSnapshot(currentSnapshot)
    clearWorkspaceNavigation(currentSnapshot.cacheKey)
  }, [currentSnapshot.cacheKey, currentSnapshotFingerprint])

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
