"use client"

import { useCallback, useEffect, useState } from "react"

import type { MemoryItemType } from "@relay/shared"

import { cn } from "@/lib/cn"
import { relayClientFetch } from "@/lib/telemetry/fetch"

import { NODE_COLORS, TYPE_LABELS } from "./constants"
import { MemoryGraph } from "./memory-graph"
import type { GraphApiResponse } from "./types"

interface GraphViewProps {
  projectId: string
  className?: string
  fullscreen?: boolean
}

export function GraphView({ projectId, className, fullscreen }: GraphViewProps) {
  const [data, setData] = useState<GraphApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphApiResponse["nodes"][number] | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchGraph() {
      setLoading(true)
      setError(null)
      try {
        const res = await relayClientFetch(`/api/projects/${projectId}/graph`)
        if (!res.ok) throw new Error("Failed to load graph data")
        const json = (await res.json()) as GraphApiResponse
        if (!cancelled) {
          setData(json)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load graph")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchGraph()
    return () => { cancelled = true }
  }, [projectId])

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    if (!nodeId || !data) {
      setSelectedNode(null)
      return
    }
    const node = data.nodes.find((n) => n.id === nodeId)
    setSelectedNode(node ?? null)
  }, [data])

  if (error) {
    return (
      <div className={cn("flex items-center justify-center text-[13px] text-red-500", fullscreen ? "h-screen" : "h-[500px]", className)}>
        {error}
      </div>
    )
  }

  return (
    <div className={cn(
      "flex overflow-hidden bg-[var(--relay-bg)]",
      fullscreen ? "h-screen" : "h-[600px] rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)]",
      className
    )}>
      {/* Graph canvas */}
      <div className="flex-1 min-w-0">
        <MemoryGraph
          data={data}
          loading={loading}
          onNodeSelect={handleNodeSelect}
          projectId={projectId}
          fullscreen={fullscreen}
          className="h-full"
        />
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <div className={cn("shrink-0 border-l border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-y-auto", fullscreen ? "w-80" : "w-72")}>
          <div className="p-4 space-y-4">
            {/* Type badge */}
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: NODE_COLORS[selectedNode.type as MemoryItemType] }}
              />
              <span className="text-[11px] font-medium text-[var(--relay-muted)] uppercase tracking-wider">
                {TYPE_LABELS[selectedNode.type as MemoryItemType] ?? selectedNode.type}
              </span>
              {selectedNode.pinned && (
                <span className="text-[10px] text-[var(--relay-accent)]">pinned</span>
              )}
            </div>

            {/* Title */}
            {selectedNode.title && (
              <h3 className="text-[14px] font-semibold text-[var(--relay-ink)] leading-snug">
                {selectedNode.title}
              </h3>
            )}

            {/* Content */}
            <p className="text-[12px] leading-relaxed text-[var(--relay-muted)] whitespace-pre-wrap">
              {selectedNode.content}
            </p>

            {/* Tags */}
            {selectedNode.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedNode.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block rounded-full bg-[var(--relay-soft)] px-2 py-0.5 text-[10px] text-[var(--relay-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Metadata */}
            <div className="pt-2 border-t border-[var(--relay-line)]">
              <p className="text-[10px] text-[var(--relay-faint)]">
                Created {new Date(selectedNode.createdAt).toLocaleDateString()}
              </p>
            </div>

            {/* Connected edges */}
            {data && (
              <ConnectedEdges
                nodeId={selectedNode.id}
                data={data}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ConnectedEdges({ nodeId, data }: { nodeId: string; data: GraphApiResponse }) {
  const connected = data.edges.filter(
    (e) => e.source === nodeId || e.target === nodeId
  )

  if (connected.length === 0) return null

  const nodeMap = new Map(data.nodes.map((n) => [n.id, n]))

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-medium text-[var(--relay-muted)] uppercase tracking-wider">
        Relations ({connected.length})
      </h4>
      <div className="space-y-1">
        {connected.slice(0, 10).map((edge, i) => {
          const otherId = edge.source === nodeId ? edge.target : edge.source
          const other = nodeMap.get(otherId)
          if (!other) return null

          const direction = edge.source === nodeId ? "outgoing" : "incoming"

          return (
            <div key={i} className="flex items-start gap-2 rounded-[var(--relay-radius-sm)] p-1.5 hover:bg-[var(--relay-soft)]">
              <span
                className="mt-0.5 h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: NODE_COLORS[other.type as MemoryItemType] }}
              />
              <div className="min-w-0">
                <p className="text-[11px] text-[var(--relay-ink)] truncate">
                  {other.title ?? other.content.slice(0, 40)}
                </p>
                <p className="text-[9px] text-[var(--relay-faint)]">
                  {edge.type} &middot; {direction} &middot; {(edge.weight * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
