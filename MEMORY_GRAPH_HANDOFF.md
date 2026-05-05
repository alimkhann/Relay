# Memory Graph View — Implementation Handoff

## What to Build

An Obsidian-like force-directed graph visualization of memory items in the Memory tab. Compact by default (~200px), expandable to full viewport overlay.

## Placement

`apps/web/src/features/memory/memory-page-content.tsx` — below the "Project State" card, above the tab pills section.

## Library

**`react-force-graph-2d`** from `react-force-graph` package. Canvas-based, handles hundreds of nodes, zoom/pan built-in.

```bash
pnpm add react-force-graph-2d --filter @relay/web
```

Must wrap in `dynamic(() => import(...), { ssr: false })` since it requires browser Canvas API.

## Data Model

### Nodes

Each item in `dashboard.memory` (type `MemoryItemDto[]`) becomes a node.

```ts
interface GraphNode {
  id: string           // memory item ID
  label: string        // truncated content (first 40 chars)
  type: MemoryItemType // "note" | "decision" | "constraint" | "requirement" | "task" | "artifact"
  decayScore: number   // 0-1, maps to node size
}
```

**Colors by type:**
- decision: `#3b82f6` (blue)
- task: `#8b5cf6` (purple)
- constraint: `#f59e0b` (amber)
- note: `#10b981` (emerald)
- requirement: `#ef4444` (red)
- artifact: `#6366f1` (indigo)

**Node size:** `Math.max(4, decayScore * 12)` — active items larger, fading items smaller.

### Edges (Hybrid Model — User Confirmed)

**Primary:** Explicit relations from the relation service. Check if a relation-service or linking mechanism exists between memory items.

Relevant code to check:
- `apps/web/src/server/services/query-decomposition-service.ts` — has `kind` mappings per memory type
- Look for any `relations` or `links` table/repository in `packages/db/`
- `compaction-service.ts:37` — references artifact linkage

**Fallback (for unlinked nodes):** Connect items of the same type to each other. This ensures no orphan nodes.

Edge construction pseudocode:
```ts
function buildEdges(nodes: GraphNode[], relations: ExplicitRelation[]): GraphEdge[] {
  const edges: GraphEdge[] = []
  const linked = new Set<string>()

  // Primary: explicit relations
  for (const rel of relations) {
    edges.push({ source: rel.fromId, target: rel.toId })
    linked.add(rel.fromId)
    linked.add(rel.toId)
  }

  // Fallback: same-type connections for unlinked nodes
  const unlinkedByType = groupBy(
    nodes.filter(n => !linked.has(n.id)),
    n => n.type
  )
  for (const [type, group] of Object.entries(unlinkedByType)) {
    // Connect sequentially within type (chain, not fully connected)
    for (let i = 0; i < group.length - 1; i++) {
      edges.push({ source: group[i].id, target: group[i + 1].id })
    }
  }

  return edges
}
```

## Component Structure

```
apps/web/src/features/memory/
├── memory-graph.tsx          # Main graph component (client-only)
├── memory-graph-container.tsx # Wrapper with expand/collapse + dynamic import
└── memory-graph-utils.ts     # Node/edge builders, color map
```

### memory-graph-container.tsx
```tsx
"use client"
import dynamic from "next/dynamic"
import { useState } from "react"
import { Expand, Minimize2 } from "lucide-react"

const MemoryGraph = dynamic(() => import("./memory-graph").then(m => m.MemoryGraph), { ssr: false })

// Show only when items >= 8
// Compact: h-[200px] with rounded border
// Expanded: fixed inset-0 z-50 bg-[var(--relay-bg)]
// Header: "Memory Graph" + expand/collapse button + color legend
```

### memory-graph.tsx
```tsx
"use client"
import ForceGraph2D from "react-force-graph-2d"
// Use nodeCanvasObject for custom rendering (colored circles + labels on hover)
// Use graphData={{ nodes, links }}
// Set width/height from container ref
// Click node → show tooltip with full content
```

## API Endpoint (if relations needed)

If explicit relations exist in DB, add to the dashboard DTO or create:
```
GET /api/projects/[id]/memory/relations
```

If no relations table exists yet, skip primary edges and just use same-type connections for v1.

## Threshold

Only render the graph when `dashboard.memory.length >= 8`. Below that, the list view is sufficient and the graph would look sparse.

## Integration Point

In `memory-page-content.tsx`, after the Memory Health indicator (~line 158) and before the tab pills (~line 262):

```tsx
{dashboard.memory.length >= 8 && (
  <FadeIn delay={0.08}>
    <MemoryGraphContainer items={dashboard.memory} />
  </FadeIn>
)}
```

## Key Files to Reference

- `apps/web/src/features/memory/memory-page-content.tsx` — insertion point
- `packages/shared/src/types/project.ts:129` — `MemoryItemDto` interface
- `packages/shared/src/constants/platforms.ts:13` — `memoryItemTypes` array
- `packages/shared/src/utils/project-context.ts` — existing context building logic
- `apps/web/src/features/memory/memory-items-list.tsx` — similar item rendering pattern

## Design Notes

- Match existing Relay design tokens: `--relay-radius`, `--relay-line`, `--relay-surface`, `--relay-ink`
- Graph background: `var(--relay-bg)` or slightly darker
- Edge color: `var(--relay-line)` with low opacity
- On node hover: show full content in tooltip positioned near cursor
- Color legend: small row of colored dots + type labels below the graph
- Expanded view: close button top-right, graph fills viewport with padding
