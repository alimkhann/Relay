import { useCallback, useRef, useState } from "react"

import { CANVAS, NODE_SIZE } from "./constants"
import type { GraphNode } from "./types"

interface Transform {
  x: number
  y: number
  k: number // zoom scale
}

interface DragState {
  nodeId: string | null
  startX: number
  startY: number
  wasDragged: boolean
}

/**
 * Handles canvas pan/zoom/drag/select interactions for the knowledge graph.
 */
export function useGraphInteractions(
  nodesRef: React.MutableRefObject<GraphNode[]>,
  onNodeDragStart?: (nodeId: string) => void,
  onNodeDragEnd?: (nodeId: string) => void
) {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: CANVAS.defaultZoom })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: CANVAS.defaultZoom })
  const dragRef = useRef<DragState>({ nodeId: null, startX: 0, startY: 0, wasDragged: false })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 })

  /** Convert screen coordinates to graph coordinates */
  const screenToGraph = useCallback((screenX: number, screenY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const t = transformRef.current
    return {
      x: ((screenX - rect.left) * (canvas.width / rect.width) - cx - t.x) / t.k,
      y: ((screenY - rect.top) * (canvas.height / rect.height) - cy - t.y) / t.k,
    }
  }, [])

  /** Find node at a screen position */
  const findNodeAt = useCallback((screenX: number, screenY: number, canvas: HTMLCanvasElement) => {
    const { x, y } = screenToGraph(screenX, screenY, canvas)
    const nodes = nodesRef.current

    // Check in reverse order (top-most first)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]!
      const r = NODE_SIZE.minRadius + node.connectionCount * NODE_SIZE.radiusPerConnection
      const dx = node.x - x
      const dy = node.y - y
      if (dx * dx + dy * dy <= (r + 4) * (r + 4)) {
        return node
      }
    }
    return null
  }, [nodesRef, screenToGraph])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const node = findNodeAt(e.clientX, e.clientY, canvas)

    if (node) {
      // Start node drag
      dragRef.current = { nodeId: node.id, startX: e.clientX, startY: e.clientY, wasDragged: false }
      node.fx = node.x
      node.fy = node.y
      onNodeDragStart?.(node.id)
    } else {
      // Start panning
      isPanningRef.current = true
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: transformRef.current.x,
        ty: transformRef.current.y,
      }
    }
  }, [findNodeAt, onNodeDragStart])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const drag = dragRef.current
    const t = transformRef.current

    if (drag.nodeId) {
      // Dragging a node
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        drag.wasDragged = true
      }

      const node = nodesRef.current.find((n) => n.id === drag.nodeId)
      if (node) {
        const { x, y } = screenToGraph(e.clientX, e.clientY, canvas)
        node.fx = x
        node.fy = y
      }
    } else if (isPanningRef.current) {
      // Panning canvas
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      const ratio = canvas.width / canvas.getBoundingClientRect().width
      const newTransform = {
        ...t,
        x: panStartRef.current.tx + dx * ratio,
        y: panStartRef.current.ty + dy * ratio,
      }
      transformRef.current = newTransform
      setTransform(newTransform)
    } else {
      // Hover cursor
      const node = findNodeAt(e.clientX, e.clientY, canvas)
      canvas.style.cursor = node ? "grab" : "default"
    }
  }, [nodesRef, findNodeAt, screenToGraph])

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current

    if (drag.nodeId) {
      const node = nodesRef.current.find((n) => n.id === drag.nodeId)
      if (node) {
        if (!drag.wasDragged) {
          // Click — select node
          node.fx = null
          node.fy = null
          setSelectedNodeId((prev) => (prev === node.id ? null : node.id))
        }
        // If dragged, keep the fixed position
        onNodeDragEnd?.(drag.nodeId)
      }
      dragRef.current = { nodeId: null, startX: 0, startY: 0, wasDragged: false }
    }

    isPanningRef.current = false
  }, [nodesRef, onNodeDragEnd])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const t = transformRef.current
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    const newK = Math.max(CANVAS.minZoom, Math.min(CANVAS.maxZoom, t.k * factor))
    const newTransform = { ...t, k: newK }
    transformRef.current = newTransform
    setTransform(newTransform)
  }, [])

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const node = findNodeAt(e.clientX, e.clientY, canvas)
    if (node) {
      // Center on node
      const newTransform = { x: -node.x * transformRef.current.k, y: -node.y * transformRef.current.k, k: Math.max(1.5, transformRef.current.k) }
      transformRef.current = newTransform
      setTransform(newTransform)
      setSelectedNodeId(node.id)
    }
  }, [findNodeAt])

  const resetView = useCallback(() => {
    const newTransform = { x: 0, y: 0, k: CANVAS.defaultZoom }
    transformRef.current = newTransform
    setTransform(newTransform)
  }, [])

  return {
    transform,
    selectedNodeId,
    setSelectedNodeId,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleDoubleClick,
    resetView,
  }
}
