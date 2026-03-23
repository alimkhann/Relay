"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"

import type { MemoryItemType } from "@relay/shared"

import { cn } from "@/lib/cn"

import { renderGraph } from "./canvas-renderer"
import { NODE_COLORS, TYPE_LABELS } from "./constants"
import type { GraphApiResponse, GraphNode } from "./types"
import { useForceSimulation } from "./use-force-simulation"
import { useGraphData } from "./use-graph-data"
import { useGraphInteractions } from "./use-graph-interactions"

interface MemoryGraphProps {
  data: GraphApiResponse | null
  loading?: boolean
  onNodeSelect?: (nodeId: string | null) => void
  projectId?: string
  fullscreen?: boolean
  className?: string
}

export function MemoryGraph({ data, loading, onNodeSelect, projectId, fullscreen, className }: MemoryGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simulatedNodesRef = useRef<GraphNode[]>([])
  const [filters, setFilters] = useState<MemoryItemType[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  const { nodes, edges, highlightIds } = useGraphData(data, { filters, searchQuery })

  const {
    transform,
    selectedNodeId,
    setSelectedNodeId,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleDoubleClick,
    resetView,
  } = useGraphInteractions(simulatedNodesRef)

  // Notify parent of selection
  useEffect(() => {
    onNodeSelect?.(selectedNodeId)
  }, [selectedNodeId, onNodeSelect])

  // Render on each simulation tick
  const onTick = useCallback((updatedNodes: GraphNode[]) => {
    simulatedNodesRef.current = updatedNodes
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Resolve CSS variable for background
    const bgColor = getComputedStyle(canvas).getPropertyValue("--relay-bg").trim() || "#ffffff"

    renderGraph(ctx, updatedNodes, edges, {
      transform,
      selectedNodeId,
      highlightIds,
      bgColor,
    })
  }, [edges, transform, selectedNodeId, highlightIds])

  const { reheat } = useForceSimulation(nodes, edges, onTick)

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const dpr = window.devicePixelRatio || 1
        canvas.width = width * dpr
        canvas.height = height * dpr
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
        const ctx = canvas.getContext("2d")
        if (ctx) ctx.scale(dpr, dpr)
      }
    })

    observer.observe(canvas.parentElement ?? canvas)
    return () => observer.disconnect()
  }, [])

  // Toggle type filter
  const toggleFilter = (type: MemoryItemType) => {
    setFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  // Available types from actual data
  const availableTypes = data
    ? [...new Set(data.nodes.map((n) => n.type))].sort()
    : []

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-[13px] text-[var(--relay-muted)] animate-pulse">
          Loading knowledge graph...
        </div>
      </div>
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full gap-2", className)}>
        <p className="text-[13px] text-[var(--relay-muted)]">
          No memory items yet. Capture some conversations to see your knowledge graph.
        </p>
      </div>
    )
  }

  return (
    <div className={cn("relative flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--relay-line)] bg-[var(--relay-surface)]">
        {/* Search */}
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-7 w-48 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-2 text-[12px] text-[var(--relay-ink)] outline-none transition focus:border-[var(--relay-accent)]"
        />

        {/* Separator */}
        <div className="h-4 w-px bg-[var(--relay-line)]" />

        {/* Type filters */}
        <div className="flex items-center gap-1">
          {availableTypes.map((type) => {
            const active = filters.length === 0 || filters.includes(type as MemoryItemType)
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleFilter(type as MemoryItemType)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition",
                  active
                    ? "bg-[var(--relay-soft)] text-[var(--relay-ink)]"
                    : "bg-transparent text-[var(--relay-faint)]"
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: NODE_COLORS[type as MemoryItemType],
                    opacity: active ? 1 : 0.3,
                  }}
                />
                {TYPE_LABELS[type as MemoryItemType] ?? type}
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* Controls */}
        <span className="text-[10px] text-[var(--relay-faint)]">
          {nodes.length} nodes &middot; {edges.length} edges
        </span>
        <button
          type="button"
          onClick={resetView}
          className="h-6 rounded-[var(--relay-radius-sm)] px-2 text-[10px] font-medium text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)] transition"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={reheat}
          className="h-6 rounded-[var(--relay-radius-sm)] px-2 text-[10px] font-medium text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)] transition"
        >
          Re-layout
        </button>
        {projectId && (
          fullscreen ? (
            <Link
              href={`/dashboard?project=${projectId}`}
              className="h-6 rounded-[var(--relay-radius-sm)] px-2 text-[10px] font-medium text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)] transition inline-flex items-center"
            >
              Back
            </Link>
          ) : (
            <Link
              href={`/projects/${projectId}/graph`}
              className="h-6 rounded-[var(--relay-radius-sm)] px-2 text-[10px] font-medium text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)] transition inline-flex items-center"
            >
              Fullscreen
            </Link>
          )
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[var(--relay-line)] bg-[var(--relay-surface)]">
        <span className="text-[10px] font-medium text-[var(--relay-faint)] uppercase tracking-wider">Edges:</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--relay-muted)]">
          <span className="inline-block w-4 h-px bg-red-500" /> supersedes
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--relay-muted)]">
          <span className="inline-block w-4 h-px bg-blue-500" /> extends
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--relay-muted)]">
          <span className="inline-block w-4 h-px bg-gray-400" /> derives
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--relay-muted)]">
          <span className="inline-block w-4 border-t border-dashed border-gray-300" /> similar
        </span>
      </div>
    </div>
  )
}
