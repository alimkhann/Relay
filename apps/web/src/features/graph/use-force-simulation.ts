import { useCallback, useEffect, useRef } from "react"

import type { GraphEdge, GraphNode } from "./types"
import { SIMULATION } from "./constants"

interface SimulationState {
  alpha: number
  running: boolean
  frameId: number | null
}

/**
 * D3-force-inspired physics simulation for graph layout.
 * Uses requestAnimationFrame for smooth animation without importing D3.
 */
export function useForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  onTick: (nodes: GraphNode[]) => void
) {
  const nodesRef = useRef<GraphNode[]>(nodes)
  const edgesRef = useRef<GraphEdge[]>(edges)
  const stateRef = useRef<SimulationState>({ alpha: 1, running: false, frameId: null })

  // Update refs when data changes
  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
    // Restart simulation when data changes
    stateRef.current.alpha = 1
    if (!stateRef.current.running) {
      stateRef.current.running = true
      tick()
    }
  }, [nodes, edges])

  const tick = useCallback(() => {
    const state = stateRef.current
    const currentNodes = nodesRef.current
    const currentEdges = edgesRef.current

    if (currentNodes.length === 0) {
      state.running = false
      return
    }

    // Decay alpha
    state.alpha *= (1 - SIMULATION.alphaDecay)
    if (state.alpha < SIMULATION.alphaMin) {
      state.running = false
      return
    }

    // Apply forces
    applyChargeForce(currentNodes, state.alpha)
    applyLinkForce(currentNodes, currentEdges, state.alpha)
    applyCenterForce(currentNodes, state.alpha)
    applyCollisionForce(currentNodes)

    // Update positions
    for (const node of currentNodes) {
      if (node.fx !== null) {
        node.x = node.fx
        node.vx = 0
      } else {
        node.vx *= SIMULATION.velocityDecay
        node.x += node.vx
      }
      if (node.fy !== null) {
        node.y = node.fy
        node.vy = 0
      } else {
        node.vy *= SIMULATION.velocityDecay
        node.y += node.vy
      }
    }

    onTick([...currentNodes])

    state.frameId = requestAnimationFrame(tick)
  }, [onTick])

  // Start/stop simulation
  useEffect(() => {
    stateRef.current.running = true
    stateRef.current.alpha = 1
    tick()

    return () => {
      stateRef.current.running = false
      if (stateRef.current.frameId !== null) {
        cancelAnimationFrame(stateRef.current.frameId)
      }
    }
  }, [tick])

  const reheat = useCallback(() => {
    stateRef.current.alpha = 0.5
    if (!stateRef.current.running) {
      stateRef.current.running = true
      tick()
    }
  }, [tick])

  return { reheat }
}

/** Repulsion between all node pairs (Barnes-Hut approximation for small graphs) */
function applyChargeForce(nodes: GraphNode[], alpha: number) {
  const strength = SIMULATION.chargeStrength * alpha
  const maxDist = SIMULATION.chargeDistanceMax

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!
      const b = nodes[j]!
      let dx = b.x - a.x
      let dy = b.y - a.y
      let dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > maxDist) continue
      if (dist < 1) {
        dx = (Math.random() - 0.5) * 2
        dy = (Math.random() - 0.5) * 2
        dist = Math.sqrt(dx * dx + dy * dy)
      }

      const force = strength / (dist * dist)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force

      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }
  }
}

/** Attraction along edges */
function applyLinkForce(nodes: GraphNode[], edges: GraphEdge[], alpha: number) {
  const nodeMap = new Map<string, GraphNode>()
  for (const node of nodes) nodeMap.set(node.id, node)

  for (const edge of edges) {
    const source = nodeMap.get(edge.source)
    const target = nodeMap.get(edge.target)
    if (!source || !target) continue

    let dx = target.x - source.x
    let dy = target.y - source.y
    let dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) dist = 1

    const isExplicit = edge.type !== "similar"
    const linkStrength = isExplicit
      ? SIMULATION.linkStrengthExplicit
      : SIMULATION.linkStrengthSimilar
    const desiredDist = SIMULATION.linkDistance * (isExplicit ? 1 : 1.5)

    const force = (dist - desiredDist) * linkStrength * alpha * edge.weight
    const fx = (dx / dist) * force * 0.5
    const fy = (dy / dist) * force * 0.5

    source.vx += fx
    source.vy += fy
    target.vx -= fx
    target.vy -= fy
  }
}

/** Gravity toward center */
function applyCenterForce(nodes: GraphNode[], alpha: number) {
  const strength = SIMULATION.centerStrength * alpha

  for (const node of nodes) {
    node.vx -= node.x * strength
    node.vy -= node.y * strength
  }
}

/** Prevent node overlap */
function applyCollisionForce(nodes: GraphNode[]) {
  const padding = SIMULATION.collisionPadding

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!
      const b = nodes[j]!
      const rA = 6 + a.connectionCount * 1.5 + padding
      const rB = 6 + b.connectionCount * 1.5 + padding
      const minDist = rA + rB

      let dx = b.x - a.x
      let dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < minDist && dist > 0) {
        const overlap = (minDist - dist) / dist * 0.5
        dx *= overlap
        dy *= overlap
        a.x -= dx
        a.y -= dy
        b.x += dx
        b.y += dy
      }
    }
  }
}
