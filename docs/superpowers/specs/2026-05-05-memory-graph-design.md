# Memory Graph Visualization — Design Spec

## Context

Relay stores memory items (decisions, tasks, constraints, notes, requirements, artifacts) with explicit relations between them (supersedes, extends, derives) and vector-similarity edges. Currently these are displayed as flat lists. A force-directed graph visualization will let users explore the full web of project memory, see connections, and edit items in context.

## Library

**`react-force-graph-2d`** — Canvas-based, d3-force physics, same engine Obsidian graph plugins use. Handles hundreds of nodes at 60fps. Wrap with `dynamic(() => import(...), { ssr: false })`.

## Entry Points

### 1. Overview Tab — Minimap Card
- Small (~200px) non-interactive graph preview in the dashboard 2-column grid
- Shows nodes colored by type, no labels, no interaction
- Click anywhere on card → opens fullscreen graph
- Only renders when `memory.length >= 8`

### 2. Memory Tab — Graph Section
- Placed above tab pills, below memory health indicator
- Same compact preview as overview minimap
- Click → fullscreen

### 3. Graph Tab — Dedicated Sidebar Tab
- New nav item in `sidebar-nav.tsx` after Memory
- Opens directly into fullscreen graph view
- Uses `Network` icon from lucide-react

## Data Model

### Nodes
Each `MemoryItemDto` becomes a node:
```ts
interface GraphNode {
  id: string
  label: string        // title ?? content.slice(0, 40)
  type: MemoryItemType // 6 types
  decayScore: number   // 0-1, maps to node size + glow intensity
  pinned: boolean
  sourceSurface: string | null
  content: string      // full content for detail panel
}
```

### Node Appearance
- Solid colored circles with soft radial glow
- Glow intensity = decayScore (fresh items glow, fading items don't)
- Size: `Math.max(5, decayScore * 14)` radius
- Opacity: `Math.max(0.2, decayScore)`
- Colors by type:
  - decision: `#3b82f6` (blue)
  - task: `#8b5cf6` (purple)
  - constraint: `#f59e0b` (amber)
  - note: `#10b981` (emerald)
  - requirement: `#ef4444` (red)
  - artifact: `#6366f1` (indigo)
- Selected node: outline ring in type color
- Labels: below node, fade with zoom (opacity ramps from 1→0 between zoom 0.8→0.3)

### Edges
```ts
interface GraphEdge {
  source: string
  target: string
  type: 'supersedes' | 'extends' | 'derives' | 'similar'
  confidence?: number
}
```

**Sources:**
1. Explicit relations from `memory_relations` table (supersedes/extends/derives + confidence)
2. Similarity edges from `getSimilarityEdgesForProject()` for unlinked nodes
3. Same-type chain fallback for any remaining orphans

**Appearance:**
- Default: all edges muted gray, varying opacity (explicit=0.25, similar=0.12)
- Explicit edges: solid line + small directional arrow at midpoint
- Similarity edges: dashed
- On node hover/click: connected edges reveal type color + pulse animation
  - supersedes: red
  - extends: blue
  - derives: purple
  - similar: stays gray dashed
- Unrelated edges dim further

## Interactions

### Hover (Obsidian-style)
- Node expands slightly (+2px radius)
- Title label appears (if hidden by zoom)
- Type badge + decay indicator shown
- Connected edges highlight with type colors
- Adjacent nodes glow brighter

### Click
- Right detail panel slides in (310px, semi-transparent, backdrop-blur)
- Unrelated nodes dim to 20% opacity
- Connected edges animate with type color pulse
- Node gets selection ring

### Double-click
- Opens edit mode in detail panel (textarea for content, type dropdown)

### Drag
- Nodes draggable with d3-force physics (Obsidian feel)
- Dragged node temporarily pinned in physics sim
- Release: node stays where placed (or re-enable physics with a button)

### Zoom
- Labels fade progressively (opacity = clamp((zoom - 0.3) / 0.5, 0, 1))
- Mousewheel zoom, pinch zoom on trackpad
- Pan with click-drag on background

## Fullscreen Layout

### Top-left: Exit button
- Minimize/shrink icon (like video player exit-fullscreen)
- Returns to previous page/tab

### Bottom-left: Legend
- Color dots + type labels for all 6 types
- Node count + edge count stats
- Semi-transparent backdrop-blur pill

### Right: Detail Panel (shown on node click)
- Header: type dot + type label + title
- Metadata row: decay score, source, captured date, pinned status
- Content: full text, scrollable
- Relations list: type label (colored) + target name + confidence score. Click → navigates to that node
- Actions: Edit, Pin/Unpin, Archive — styled as icon buttons with labels
  - Edit: type-colored accent
  - Pin: toggle (filled/outlined pin icon)
  - Archive: muted, with confirmation
- Panel close: small ✕ top-right of panel (not fullscreen exit)

## API

### New endpoint: GET /api/projects/[id]/memory/relations
Returns all relations for the project:
```ts
{
  relations: Array<{
    sourceId: string
    targetId: string
    relationType: 'supersedes' | 'extends' | 'derives'
    confidence: number
  }>
  similarityEdges: Array<{
    sourceId: string
    targetId: string
    similarity: number
  }>
}
```

Uses existing repository methods:
- `memoryRepository.getRelationsForProject(projectId)`
- `memoryRepository.getSimilarityEdgesForProject(projectId)`

## File Structure

```
apps/web/src/features/graph/
├── graph-page-content.tsx      # Fullscreen graph page (Graph tab)
├── memory-graph.tsx            # Core graph component (react-force-graph-2d)
├── memory-graph-container.tsx  # Wrapper: compact/fullscreen modes, dynamic import
├── memory-graph-detail-panel.tsx # Right-side detail panel
├── memory-graph-utils.ts       # Node/edge builders, color map, helpers
└── use-graph-data.ts           # Hook: fetch + transform memory + relations into graph data

apps/web/src/features/projects/
└── dashboard-graph-minimap.tsx  # Overview tab minimap card

apps/web/src/app/(workspace)/graph/
└── page.tsx                     # Graph tab route (server component)

apps/web/src/server/api/routers/ (or equivalent)
└── memory relations endpoint
```

## Design Tokens

All styling uses existing Relay CSS variables:
- Background: `var(--relay-bg)` / slightly darker for fullscreen
- Panel: `var(--relay-surface)` with backdrop-blur
- Borders: `var(--relay-line)`
- Text: `var(--relay-ink)`, `var(--relay-ink-secondary)`, `var(--relay-muted)`
- Radius: `var(--relay-radius)`, `var(--relay-radius-lg)`
- Shadows: `var(--relay-shadow-lg)` for panel
- Transitions: `var(--relay-transition)` (180ms ease)

## Threshold

Graph only renders when `memory.length >= 8`. Below that, list view is sufficient.

## Verification

1. Memory tab shows graph section when >= 8 items
2. Overview tab shows minimap card
3. Graph tab opens fullscreen graph
4. Nodes colored by type with glow proportional to decay
5. Edges connect properly between related items
6. Hover highlights node + edges + neighbors
7. Click opens detail panel with full item info
8. Edit mode works from panel
9. Zoom fades labels progressively
10. Drag nodes with physics feel
11. Fullscreen exit returns to previous view
12. Dark mode + light mode both work
13. Retina/HiDPI rendering is crisp
