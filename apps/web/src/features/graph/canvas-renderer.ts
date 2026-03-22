import { EDGE_COLORS, EDGE_DASHED, NODE_COLORS, NODE_SIZE } from "./constants"
import type { GraphEdge, GraphNode } from "./types"

interface RenderOptions {
  transform: { x: number; y: number; k: number }
  selectedNodeId: string | null
  highlightIds: Set<string>
  /** resolved CSS color for background */
  bgColor: string
}

/**
 * Renders the graph onto a 2D canvas context.
 * Called on each animation frame.
 */
export function renderGraph(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: RenderOptions
) {
  const { transform, selectedNodeId, highlightIds, bgColor } = options
  const { width, height } = ctx.canvas

  // Clear
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, width, height)

  // Apply transform
  ctx.save()
  ctx.translate(width / 2 + transform.x, height / 2 + transform.y)
  ctx.scale(transform.k, transform.k)

  // Build node lookup
  const nodeMap = new Map<string, GraphNode>()
  for (const node of nodes) nodeMap.set(node.id, node)

  // Draw edges
  for (const edge of edges) {
    const source = nodeMap.get(edge.source)
    const target = nodeMap.get(edge.target)
    if (!source || !target) continue

    drawEdge(ctx, source, target, edge, selectedNodeId)
  }

  // Draw nodes
  for (const node of nodes) {
    const isSelected = node.id === selectedNodeId
    const isHighlighted = highlightIds.size > 0 && highlightIds.has(node.id)
    const isDimmed = highlightIds.size > 0 && !highlightIds.has(node.id) && !isSelected
    drawNode(ctx, node, isSelected, isHighlighted, isDimmed)
  }

  ctx.restore()
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  source: GraphNode,
  target: GraphNode,
  edge: GraphEdge,
  selectedNodeId: string | null
) {
  const isConnectedToSelected = selectedNodeId !== null &&
    (edge.source === selectedNodeId || edge.target === selectedNodeId)

  ctx.beginPath()
  ctx.moveTo(source.x, source.y)
  ctx.lineTo(target.x, target.y)

  const baseAlpha = isConnectedToSelected ? 0.8 : Math.max(0.15, edge.weight * 0.6)
  ctx.strokeStyle = EDGE_COLORS[edge.type]
  ctx.globalAlpha = baseAlpha
  ctx.lineWidth = isConnectedToSelected ? 2 : 1

  if (EDGE_DASHED[edge.type]) {
    ctx.setLineDash([4, 4])
  } else {
    ctx.setLineDash([])
  }

  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.setLineDash([])
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  isSelected: boolean,
  isHighlighted: boolean,
  isDimmed: boolean
) {
  const r = NODE_SIZE.minRadius + node.connectionCount * NODE_SIZE.radiusPerConnection
  const clampedR = Math.min(r, NODE_SIZE.maxRadius)
  const color = NODE_COLORS[node.type] ?? "#6b7280"

  // Selection ring
  if (isSelected) {
    ctx.beginPath()
    ctx.arc(node.x, node.y, clampedR + NODE_SIZE.selectionRingWidth + 1, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = NODE_SIZE.selectionRingWidth
    ctx.globalAlpha = 0.6
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Highlight glow
  if (isHighlighted) {
    ctx.beginPath()
    ctx.arc(node.x, node.y, clampedR + 6, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.2
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // Main circle
  ctx.beginPath()
  ctx.arc(node.x, node.y, clampedR, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = isDimmed ? 0.25 : 1
  ctx.fill()

  // Border
  ctx.strokeStyle = isDimmed ? "transparent" : "rgba(255,255,255,0.3)"
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.globalAlpha = 1

  // Pin indicator
  if (node.pinned) {
    const s = NODE_SIZE.pinIconSize
    ctx.fillStyle = "#ffffff"
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.arc(node.x + clampedR * 0.5, node.y - clampedR * 0.5, s / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // Label for selected or large nodes
  if (isSelected || (node.title && clampedR >= 12)) {
    const label = node.title ?? node.content.slice(0, 30)
    ctx.font = `${isSelected ? "bold " : ""}11px system-ui, -apple-system, sans-serif`
    ctx.fillStyle = isDimmed ? "rgba(107,114,128,0.4)" : "rgba(107,114,128,0.9)"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"

    const maxWidth = 120
    const text = label.length > 40 ? label.slice(0, 37) + "..." : label
    ctx.fillText(text, node.x, node.y + clampedR + 4, maxWidth)
  }
}
