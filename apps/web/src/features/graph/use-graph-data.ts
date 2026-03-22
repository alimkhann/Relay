import { useMemo } from "react"

import type { MemoryItemType } from "@relay/shared"

import type { GraphApiResponse, GraphData, GraphNode } from "./types"

/**
 * Transforms API response into graph data with computed fields.
 * Applies optional type filters and search highlighting.
 */
export function useGraphData(
  response: GraphApiResponse | null,
  options?: {
    filters?: MemoryItemType[]
    searchQuery?: string
  }
): GraphData & { highlightIds: Set<string> } {
  return useMemo(() => {
    if (!response) {
      return { nodes: [], edges: [], highlightIds: new Set<string>() }
    }

    const { filters, searchQuery } = options ?? {}

    // Count connections per node
    const connectionCounts = new Map<string, number>()
    for (const edge of response.edges) {
      connectionCounts.set(edge.source, (connectionCounts.get(edge.source) ?? 0) + 1)
      connectionCounts.set(edge.target, (connectionCounts.get(edge.target) ?? 0) + 1)
    }

    // Filter nodes by type if filters are active
    const filteredNodeIds = new Set<string>()
    let nodes: GraphNode[] = response.nodes
      .filter((n) => {
        if (filters && filters.length > 0 && !filters.includes(n.type)) return false
        return true
      })
      .map((n, i) => {
        filteredNodeIds.add(n.id)
        // Distribute nodes in a circle initially
        const angle = (2 * Math.PI * i) / response.nodes.length
        const radius = Math.min(300, response.nodes.length * 10)
        return {
          ...n,
          connectionCount: connectionCounts.get(n.id) ?? 0,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          fx: null,
          fy: null,
        }
      })

    // Filter edges to only include edges between visible nodes
    const edges = response.edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    )

    // Search highlighting
    const highlightIds = new Set<string>()
    if (searchQuery && searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase()
      for (const node of nodes) {
        const text = `${node.title ?? ""} ${node.content}`.toLowerCase()
        if (text.includes(q)) {
          highlightIds.add(node.id)
        }
      }
    }

    return { nodes, edges, highlightIds }
  }, [response, options?.filters, options?.searchQuery])
}
