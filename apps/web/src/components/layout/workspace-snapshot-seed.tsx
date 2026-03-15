"use client"

import { useEffect } from "react"

import {
  cacheWorkspaceSnapshot,
  clearWorkspaceNavigation,
  type WorkspaceSnapshot,
} from "@/components/layout/workspace-cache"

export function WorkspaceSnapshotSeed({
  snapshot,
}: {
  snapshot: WorkspaceSnapshot
}) {
  useEffect(() => {
    cacheWorkspaceSnapshot(snapshot)
    clearWorkspaceNavigation(snapshot.cacheKey)
  }, [snapshot.cacheKey, snapshot])

  return null
}
