# Memory Graph Visualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Obsidian-like force-directed graph visualization of memory items with hover/click interactions, a fullscreen mode, and inline editing.

**Architecture:** `react-force-graph-2d` renders nodes (memory items) and edges (explicit relations + similarity) on Canvas. Three entry points: overview minimap, memory tab section, dedicated Graph tab. Shared graph component with compact/fullscreen modes. Detail panel slides in from right on node click.

**Tech Stack:** react-force-graph-2d, d3-force (transitive), Next.js dynamic imports, Radix Dialog, Motion (framer-motion), Tailwind + Relay CSS variables.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `apps/web/src/features/graph/memory-graph-utils.ts` | Color map, node/edge builders, type constants |
| `apps/web/src/features/graph/use-graph-data.ts` | Hook: fetch relations API, transform memory+relations into graph data |
| `apps/web/src/features/graph/memory-graph.tsx` | Core graph component wrapping react-force-graph-2d |
| `apps/web/src/features/graph/memory-graph-detail-panel.tsx` | Right-side detail panel with edit mode |
| `apps/web/src/features/graph/memory-graph-container.tsx` | Wrapper: compact/fullscreen toggle, dynamic import, legend, controls |
| `apps/web/src/features/graph/graph-page-content.tsx` | Graph tab page content (client component) |
| `apps/web/src/app/(workspace)/graph/page.tsx` | Graph tab route (server component) |
| `apps/web/src/features/projects/dashboard-graph-minimap.tsx` | Overview tab minimap card |
| `apps/web/src/app/api/projects/[id]/memory/relations/route.ts` | API: returns relations + similarity edges |

---

### Task 1: Install react-force-graph-2d

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install the package**

Run: `pnpm add react-force-graph-2d --filter @relay/web`

- [ ] **Step 2: Verify it installed**

Run: `pnpm ls react-force-graph-2d --filter @relay/web`

Expected: Shows `react-force-graph-2d` with version.

- [ ] **Step 3: Commit**

Stage `apps/web/package.json` and `pnpm-lock.yaml`, commit with message: `feat(graph): add react-force-graph-2d dependency`

---

### Task 2: Graph utilities — color map, node/edge builders

**Files:**
- Create: `apps/web/src/features/graph/memory-graph-utils.ts`

- [ ] **Step 1: Create the utility file**

```typescript
import type { MemoryItemDto } from "@relay/shared";

export const TYPE_COLORS: Record<string, string> = {
  decision: "#3b82f6",
  task: "#8b5cf6",
  constraint: "#f59e0b",
  note: "#10b981",
  requirement: "#ef4444",
  artifact: "#6366f1",
};

export const RELATION_COLORS: Record<string, string> = {
  supersedes: "#ef4444",
  extends: "#3b82f6",
  derives: "#8b5cf6",
  similar: "#71717a",
};

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  decayScore: number;
  pinned: boolean;
  sourceSurface: string | null;
  content: string;
  title: string | null;
  updatedAt: string;
  capturedAt: string | null;
  metadata?: Record<string, unknown>;
}

export interface GraphLink {
  source: string;
  target: string;
  relationType: "supersedes" | "extends" | "derives" | "similar";
  confidence: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export function buildGraphNodes(items: MemoryItemDto[]): GraphNode[] {
  return items.map((item) => ({
    id: item.id,
    label: item.title ?? item.content.slice(0, 40),
    type: item.type,
    decayScore: item.decayScore,
    pinned: item.pinned,
    sourceSurface: item.sourceSurface,
    content: item.content,
    title: item.title,
    updatedAt: item.updatedAt,
    capturedAt: item.capturedAt,
    metadata: item.metadata,
  }));
}

export function buildGraphLinks(
  nodes: GraphNode[],
  relations: Array<{ sourceId: string; targetId: string; relationType: string; confidence: number }>,
  similarityEdges: Array<{ sourceId: string; targetId: string; similarity: number }>,
): GraphLink[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const links: GraphLink[] = [];
  const linked = new Set<string>();

  for (const rel of relations) {
    if (nodeIds.has(rel.sourceId) && nodeIds.has(rel.targetId)) {
      links.push({
        source: rel.sourceId,
        target: rel.targetId,
        relationType: rel.relationType as GraphLink["relationType"],
        confidence: rel.confidence,
      });
      linked.add(rel.sourceId);
      linked.add(rel.targetId);
    }
  }

  for (const edge of similarityEdges) {
    if (nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId) && !linked.has(edge.sourceId) && !linked.has(edge.targetId)) {
      links.push({
        source: edge.sourceId,
        target: edge.targetId,
        relationType: "similar",
        confidence: edge.similarity,
      });
      linked.add(edge.sourceId);
      linked.add(edge.targetId);
    }
  }

  const orphans = nodes.filter((n) => !linked.has(n.id));
  const byType = new Map<string, GraphNode[]>();
  for (const n of orphans) {
    const group = byType.get(n.type) ?? [];
    group.push(n);
    byType.set(n.type, group);
  }
  for (const group of byType.values()) {
    for (let i = 0; i < group.length - 1; i++) {
      links.push({
        source: group[i]!.id,
        target: group[i + 1]!.id,
        relationType: "similar",
        confidence: 0.5,
      });
    }
  }

  return links;
}

export function nodeRadius(decayScore: number): number {
  return Math.max(5, decayScore * 14);
}

export function nodeOpacity(decayScore: number): number {
  return Math.max(0.2, decayScore);
}

export function labelOpacity(zoom: number): number {
  return Math.max(0, Math.min(1, (zoom - 0.3) / 0.5));
}

export function hexToRgb(hex: string): string | null {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return `${parseInt(m[1]!, 16)},${parseInt(m[2]!, 16)},${parseInt(m[3]!, 16)}`;
}
```

- [ ] **Step 2: Commit**

Stage and commit with message: `feat(graph): add graph utility functions — colors, node/edge builders`

---

### Task 3: Relations API endpoint

**Files:**
- Create: `apps/web/src/app/api/projects/[id]/memory/relations/route.ts`

- [ ] **Step 1: Check db import pattern**

Run: `grep -r "getDb\|db\.memory\|memoryRepository" apps/web/src/app/api/projects/\[id\]/ --include="*.ts" -l | head -5`

Check how other routes import the database. Adjust the import in the next step accordingly.

- [ ] **Step 2: Create the API route**

```typescript
import { NextResponse } from "next/server";

import { withApiAuth } from "@/server/http/api-route";
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer";
import { getDb } from "@/server/db";

export const GET = withApiAuth(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await resolveViewer(request.headers.get("authorization"));
    const { id } = await params;
    requireViewerProject(viewer, id, "memory:read");

    const db = getDb();

    const [relations, similarityEdges] = await Promise.all([
      db.memory.getRelationsForProject(id),
      db.memory.getSimilarityEdgesForProject(id, 0.75),
    ]);

    return NextResponse.json({
      relations: relations.map((r) => ({
        sourceId: r.sourceId,
        targetId: r.targetId,
        relationType: r.relationType,
        confidence: r.confidence,
      })),
      similarityEdges,
    });
  },
);
```

Note: Adjust `getDb` import path based on what you found in Step 1. If the pattern is service-based, create a thin service wrapper instead.

- [ ] **Step 3: Commit**

Stage and commit with message: `feat(graph): add relations API endpoint for graph edges`

---

### Task 4: useGraphData hook

**Files:**
- Create: `apps/web/src/features/graph/use-graph-data.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useEffect, useState } from "react";
import type { MemoryItemDto } from "@relay/shared";

import {
  buildGraphNodes,
  buildGraphLinks,
  type GraphData,
} from "./memory-graph-utils";
import { relayClientFetch } from "@/lib/telemetry/fetch";

interface RelationsResponse {
  relations: Array<{
    sourceId: string;
    targetId: string;
    relationType: string;
    confidence: number;
  }>;
  similarityEdges: Array<{
    sourceId: string;
    targetId: string;
    similarity: number;
  }>;
}

export function useGraphData(
  projectId: string,
  memoryItems: MemoryItemDto[],
): { data: GraphData | null; loading: boolean } {
  const [relationsData, setRelationsData] = useState<RelationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    relayClientFetch(`/api/projects/${projectId}/memory/relations`)
      .then((res) => res.json() as Promise<RelationsResponse>)
      .then((data) => {
        if (!cancelled) {
          setRelationsData(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRelationsData({ relations: [], similarityEdges: [] });
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [projectId]);

  if (loading || !relationsData) return { data: null, loading };

  const nodes = buildGraphNodes(memoryItems);
  const links = buildGraphLinks(nodes, relationsData.relations, relationsData.similarityEdges);

  return { data: { nodes, links }, loading: false };
}
```

- [ ] **Step 2: Commit**

Stage and commit with message: `feat(graph): add useGraphData hook — fetches relations, builds graph data`

---

### Task 5: Core graph component (react-force-graph-2d)

**Files:**
- Create: `apps/web/src/features/graph/memory-graph.tsx`

- [ ] **Step 1: Create the core graph component**

This wraps `react-force-graph-2d` with custom Canvas rendering for nodes (colored circles with glow, zoom-dependent labels) and edges (muted default, colored on interaction with directional arrows).

Key rendering logic:
- Nodes: Use `nodeCanvasObject` for custom rendering — glow gradient, filled circle, selection ring, hover expand, label below
- Edges: Use `linkCanvasObject` — solid for explicit relations, dashed for similarity, highlight connected edges to active node in type color with pulse, dim unrelated edges
- Arrow: Small triangle at midpoint of explicit edges
- Track zoom level via `onZoom` for label opacity
- Track hover/selected state from parent props to compute highlight sets

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";

import {
  TYPE_COLORS,
  RELATION_COLORS,
  nodeRadius,
  nodeOpacity,
  labelOpacity,
  hexToRgb,
  type GraphData,
  type GraphNode,
  type GraphLink,
} from "./memory-graph-utils";

interface MemoryGraphProps {
  data: GraphData;
  width: number;
  height: number;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover: (node: GraphNode | null) => void;
  onBackgroundClick: () => void;
  interactive?: boolean;
}

export function MemoryGraph({
  data,
  width,
  height,
  selectedNodeId,
  hoveredNodeId,
  onNodeClick,
  onNodeHover,
  onBackgroundClick,
  interactive = true,
}: MemoryGraphProps) {
  const fgRef = useRef<ForceGraphMethods | undefined>();
  const [zoom, setZoom] = useState(1);

  const connectedTo = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) return { nodes: new Set<string>(), links: new Set<number>() };
      const nodes = new Set<string>([nodeId]);
      const links = new Set<number>();
      data.links.forEach((link, i) => {
        const src = typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
        const tgt = typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
        if (src === nodeId || tgt === nodeId) {
          nodes.add(src);
          nodes.add(tgt);
          links.add(i);
        }
      });
      return { nodes, links };
    },
    [data.links],
  );

  const activeNodeId = selectedNodeId ?? hoveredNodeId;
  const { nodes: highlightNodes, links: highlightLinks } = connectedTo(activeNodeId);

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D) => {
      const x = (node as any).x as number;
      const y = (node as any).y as number;
      if (x == null || y == null) return;

      const r = nodeRadius(node.decayScore);
      const color = TYPE_COLORS[node.type] ?? "#71717a";
      const isDimmed = activeNodeId != null && !highlightNodes.has(node.id);
      const op = isDimmed ? 0.15 : nodeOpacity(node.decayScore);

      ctx.save();
      ctx.globalAlpha = op;

      if (node.decayScore > 0.3 && !isDimmed) {
        const rgb = hexToRgb(color);
        if (rgb) {
          const grad = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.5);
          grad.addColorStop(0, `rgba(${rgb},${0.35 * node.decayScore})`);
          grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (node.id === selectedNodeId) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.stroke();
      }

      if (node.id === hoveredNodeId && node.id !== selectedNodeId) {
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
      }

      const lOp = labelOpacity(zoom);
      if (lOp > 0 && !isDimmed) {
        ctx.globalAlpha = op * lOp * 0.85;
        ctx.font = `${Math.max(3, 4 / Math.sqrt(zoom))}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = "#a1a1aa";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(node.label, x, y + r + 2);
      }

      ctx.restore();
    },
    [activeNodeId, highlightNodes, selectedNodeId, hoveredNodeId, zoom],
  );

  const paintLink = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D) => {
      const src = link.source as any;
      const tgt = link.target as any;
      if (src.x == null || tgt.x == null) return;

      const linkIdx = data.links.indexOf(link);
      const isHighlighted = highlightLinks.has(linkIdx);
      const isDimmed = activeNodeId != null && !isHighlighted;
      const isSimilar = link.relationType === "similar";

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);

      if (isHighlighted) {
        const color = RELATION_COLORS[link.relationType] ?? "#71717a";
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
      } else if (isDimmed) {
        ctx.strokeStyle = "#71717a";
        ctx.globalAlpha = 0.05;
        ctx.lineWidth = 0.5;
        ctx.setLineDash(isSimilar ? [2, 2] : []);
      } else {
        ctx.strokeStyle = "#71717a";
        ctx.globalAlpha = isSimilar ? 0.1 : 0.2;
        ctx.lineWidth = isSimilar ? 0.5 : 1;
        ctx.setLineDash(isSimilar ? [2, 2] : []);
      }

      ctx.stroke();
      ctx.setLineDash([]);

      if (!isSimilar && (isHighlighted || !isDimmed)) {
        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
        const sz = isHighlighted ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(mx + sz * Math.cos(angle), my + sz * Math.sin(angle));
        ctx.lineTo(mx - sz * Math.cos(angle - 0.5), my - sz * Math.sin(angle - 0.5));
        ctx.lineTo(mx - sz * Math.cos(angle + 0.5), my - sz * Math.sin(angle + 0.5));
        ctx.closePath();
        ctx.fillStyle = isHighlighted
          ? RELATION_COLORS[link.relationType] ?? "#71717a"
          : "#71717a";
        ctx.globalAlpha = isHighlighted ? 0.5 : 0.15;
        ctx.fill();
      }

      ctx.restore();
    },
    [activeNodeId, highlightLinks, data.links],
  );

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={data}
      width={width}
      height={height}
      nodeId="id"
      nodeCanvasObject={paintNode as any}
      nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
        const r = nodeRadius((node as GraphNode).decayScore) + 4;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }}
      linkCanvasObject={paintLink as any}
      onNodeClick={(node) => interactive && onNodeClick(node as GraphNode)}
      onNodeHover={(node) => interactive && onNodeHover(node as GraphNode | null)}
      onBackgroundClick={onBackgroundClick}
      onZoom={({ k }) => setZoom(k)}
      enableNodeDrag={interactive}
      enableZoomInteraction={interactive}
      enablePanInteraction={interactive}
      cooldownTicks={100}
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
    />
  );
}
```

- [ ] **Step 2: Commit**

Stage and commit with message: `feat(graph): add core MemoryGraph component with custom Canvas rendering`

---

### Task 6: Detail panel component

**Files:**
- Create: `apps/web/src/features/graph/memory-graph-detail-panel.tsx`

- [ ] **Step 1: Create the detail panel**

Panel slides in from right. Shows type badge, title, metadata (decay/source/date/pinned), content (with edit mode), relations list (clickable), and action buttons (Edit/Pin/Archive). Uses framer-motion for enter/exit animation.

Key details:
- Header: type dot with glow + uppercase type label + title
- Metadata row: decay score (green/amber/gray), source surface, captured date, pinned status
- Content: text display OR textarea when editing, with Save/Cancel buttons
- Relations: list of connected items with relation type colored label, target name, confidence score. Click navigates to that node.
- Actions: Edit (type-colored accent), Pin/Unpin (toggle icon), Archive (red on hover, with visual warning)
- All mutations go through `relayClientFetch` to existing memory API endpoints
- Uses `useRouter().refresh()` after mutations

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Pin, PinOff, Archive, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { TYPE_COLORS, RELATION_COLORS } from "./memory-graph-utils";
import type { GraphNode, GraphLink } from "./memory-graph-utils";
import { relayClientFetch } from "@/lib/telemetry/fetch";

interface DetailPanelProps {
  node: GraphNode | null;
  links: GraphLink[];
  allNodes: GraphNode[];
  projectId: string;
  onClose: () => void;
  onNavigateToNode: (nodeId: string) => void;
}

export function MemoryGraphDetailPanel({
  node,
  links,
  allNodes,
  projectId,
  onClose,
  onNavigateToNode,
}: DetailPanelProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [pending, startTransition] = useTransition();

  if (!node) return null;

  const nodeLinks = links.filter((l) => {
    const src = typeof l.source === "object" ? (l.source as any).id : l.source;
    const tgt = typeof l.target === "object" ? (l.target as any).id : l.target;
    return src === node.id || tgt === node.id;
  });

  const color = TYPE_COLORS[node.type] ?? "#71717a";
  const decayColor = node.decayScore >= 0.3 ? "#10b981" : node.decayScore >= 0.1 ? "#f59e0b" : "#71717a";

  function startEdit() {
    setEditContent(node!.content);
    setEditing(true);
  }

  function saveEdit() {
    startTransition(() => {
      void (async () => {
        await relayClientFetch(`/api/projects/${projectId}/memory`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: node!.id, content: editContent }),
        });
        setEditing(false);
        router.refresh();
      })();
    });
  }

  function togglePin() {
    startTransition(() => {
      void (async () => {
        await relayClientFetch(`/api/projects/${projectId}/memory`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: node!.id, pinned: !node!.pinned }),
        });
        router.refresh();
      })();
    });
  }

  function archiveItem() {
    startTransition(() => {
      void (async () => {
        await relayClientFetch(`/api/projects/${projectId}/memory`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: node!.id, isArchived: true }),
        });
        onClose();
        router.refresh();
      })();
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        key={node.id}
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 20, opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
        className="absolute top-0 right-0 bottom-0 w-[320px] flex flex-col gap-3.5 rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-surface)]/95 p-5 shadow-[var(--relay-shadow-lg)] backdrop-blur-xl z-10 overflow-hidden"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: color, boxShadow: `0 0 6px ${color}60` }}
              />
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color }}>
                {node.type}
              </span>
            </div>
            <h3 className="text-[14px] font-semibold text-[var(--relay-ink)] leading-snug">
              {node.title ?? node.label}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--relay-muted)] hover:text-[var(--relay-ink)] transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex gap-3 rounded-[var(--relay-radius-sm)] bg-[var(--relay-bg)]/50 px-2.5 py-2">
          <div>
            <span className="text-[9px] text-[var(--relay-faint)] block">Decay</span>
            <span className="text-[11px] font-medium" style={{ color: decayColor }}>{node.decayScore.toFixed(2)}</span>
          </div>
          {node.sourceSurface && (
            <div>
              <span className="text-[9px] text-[var(--relay-faint)] block">Source</span>
              <span className="text-[11px] text-[var(--relay-muted)]">{node.sourceSurface}</span>
            </div>
          )}
          {node.capturedAt && (
            <div>
              <span className="text-[9px] text-[var(--relay-faint)] block">Captured</span>
              <span className="text-[11px] text-[var(--relay-muted)]">
                {new Date(node.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          )}
          <div>
            <span className="text-[9px] text-[var(--relay-faint)] block">Pinned</span>
            <span className="text-[11px] text-[var(--relay-muted)]">{node.pinned ? "Yes" : "No"}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <span className="text-[9px] text-[var(--relay-faint)] uppercase tracking-wider block mb-1.5">Content</span>
          {editing ? (
            <div className="space-y-2">
              <textarea
                className="w-full min-h-[100px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-3 py-2 text-[12px] leading-relaxed text-[var(--relay-ink)] outline-none focus:border-[var(--relay-accent)] resize-y"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={saveEdit}
                  disabled={pending}
                  className="px-3 py-1 rounded-[var(--relay-radius-sm)] text-[11px] font-medium text-[var(--relay-bg)] bg-[var(--relay-accent)] hover:bg-[var(--relay-accent-hover)] transition-colors"
                >
                  {pending ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1 rounded-[var(--relay-radius-sm)] text-[11px] text-[var(--relay-muted)] hover:text-[var(--relay-ink)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed text-[var(--relay-ink-secondary)]">{node.content}</p>
          )}
        </div>

        {nodeLinks.length > 0 && (
          <div>
            <span className="text-[9px] text-[var(--relay-faint)] uppercase tracking-wider block mb-2">
              Relations ({nodeLinks.length})
            </span>
            <div className="flex flex-col gap-1.5 max-h-[120px] overflow-y-auto">
              {nodeLinks.map((link, i) => {
                const src = typeof link.source === "object" ? (link.source as any).id : link.source;
                const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
                const otherId = src === node.id ? tgt : src;
                const otherNode = allNodes.find((n) => n.id === otherId);
                const relColor = RELATION_COLORS[link.relationType] ?? "#71717a";
                return (
                  <button
                    key={i}
                    onClick={() => onNavigateToNode(otherId)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--relay-radius-sm)] bg-[var(--relay-bg)]/30 hover:bg-[var(--relay-soft)] transition-colors text-left"
                  >
                    <span className="text-[9px] min-w-[52px]" style={{ color: relColor }}>{link.relationType}</span>
                    <span className="text-[10px] text-[var(--relay-muted)] truncate flex-1">
                      {otherNode?.label ?? otherId.slice(0, 8)}
                    </span>
                    <span className="text-[9px] text-[var(--relay-faint)]">{link.confidence.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-[var(--relay-line)]">
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--relay-radius-sm)] text-[11px] font-medium transition-colors"
            style={{ background: `${color}18`, borderColor: `${color}30`, color, border: `1px solid ${color}30` }}
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button
            onClick={togglePin}
            disabled={pending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] text-[11px] text-[var(--relay-muted)] hover:text-[var(--relay-ink)] hover:bg-[var(--relay-soft)] transition-colors"
          >
            {node.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
            {node.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            onClick={archiveItem}
            disabled={pending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] text-[11px] text-[var(--relay-muted)] hover:text-red-400 hover:border-red-400/30 transition-colors"
          >
            <Archive className="h-3 w-3" /> Archive
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

Stage and commit with message: `feat(graph): add detail panel with edit, pin, archive actions`

---

### Task 7: Graph container (compact + fullscreen modes)

**Files:**
- Create: `apps/web/src/features/graph/memory-graph-container.tsx`

- [ ] **Step 1: Create the container component**

Container manages compact (200px preview, click to expand) and fullscreen (fixed overlay) modes. Dynamic imports the graph. Provides legend, exit button, and detail panel orchestration.

```typescript
"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { motion } from "motion/react";
import type { MemoryItemDto } from "@relay/shared";

import { TYPE_COLORS, type GraphNode } from "./memory-graph-utils";
import { useGraphData } from "./use-graph-data";
import { MemoryGraphDetailPanel } from "./memory-graph-detail-panel";

const MemoryGraph = dynamic(
  () => import("./memory-graph").then((m) => ({ default: m.MemoryGraph })),
  { ssr: false },
);

interface GraphContainerProps {
  projectId: string;
  memoryItems: MemoryItemDto[];
  initialFullscreen?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  decision: "Decision",
  task: "Task",
  constraint: "Constraint",
  note: "Note",
  requirement: "Req",
  artifact: "Artifact",
};

export function MemoryGraphContainer({
  projectId,
  memoryItems,
  initialFullscreen = false,
}: GraphContainerProps) {
  const { data, loading } = useGraphData(projectId, memoryItems);
  const [fullscreen, setFullscreen] = useState(initialFullscreen);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 200 });

  useEffect(() => {
    function measure() {
      if (fullscreen) {
        setDimensions({ width: window.innerWidth, height: window.innerHeight });
      } else if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: 200 });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fullscreen]);

  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedNodeId) setSelectedNodeId(null);
        else setFullscreen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, selectedNodeId]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNavigateToNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const selectedNode = data?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  if (loading || !data) {
    return (
      <div className="h-[200px] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] animate-pulse" />
    );
  }

  const graphContent = (
    <>
      <MemoryGraph
        data={data}
        width={fullscreen ? dimensions.width - (selectedNodeId ? 340 : 0) : dimensions.width}
        height={dimensions.height}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        onNodeClick={handleNodeClick}
        onNodeHover={setHoveredNodeId}
        onBackgroundClick={handleBackgroundClick}
        interactive={fullscreen}
      />
      {fullscreen && selectedNode && (
        <MemoryGraphDetailPanel
          node={selectedNode}
          links={data.links}
          allNodes={data.nodes}
          projectId={projectId}
          onClose={() => setSelectedNodeId(null)}
          onNavigateToNode={handleNavigateToNode}
        />
      )}
    </>
  );

  if (fullscreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-[var(--relay-bg)]"
      >
        <div className="relative w-full h-full">
          {graphContent}

          <button
            onClick={() => setFullscreen(false)}
            className="fixed top-4 left-4 z-[60] flex items-center gap-1.5 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]/90 px-3 py-2 text-[11px] text-[var(--relay-muted)] hover:text-[var(--relay-ink)] hover:bg-[var(--relay-surface)] backdrop-blur-lg transition-colors shadow-[var(--relay-shadow)]"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Exit
          </button>

          <div className="fixed bottom-4 left-4 z-[60] flex items-center gap-2.5 rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]/90 px-3 py-2 backdrop-blur-lg shadow-[var(--relay-shadow)]">
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[type] }} />
                <span className="text-[9px] text-[var(--relay-muted)]">{label}</span>
              </div>
            ))}
            <span className="text-[var(--relay-line)] mx-0.5">|</span>
            <span className="text-[9px] text-[var(--relay-faint)]">
              {data.nodes.length} nodes · {data.links.length} edges
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={() => setFullscreen(true)}
      className="relative h-[200px] cursor-pointer overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] transition-shadow hover:shadow-[var(--relay-shadow)] group"
    >
      {graphContent}

      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--relay-bg)]/40 backdrop-blur-[1px]">
        <div className="flex items-center gap-1.5 rounded-full bg-[var(--relay-surface)]/90 px-3 py-1.5 text-[11px] text-[var(--relay-muted)] shadow-[var(--relay-shadow)]">
          <Maximize2 className="h-3 w-3" />
          Open graph
        </div>
      </div>

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <span key={type} className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

Stage and commit with message: `feat(graph): add graph container with compact/fullscreen modes`

---

### Task 8: Graph tab route + page content + sidebar nav

**Files:**
- Create: `apps/web/src/app/(workspace)/graph/page.tsx`
- Create: `apps/web/src/features/graph/graph-page-content.tsx`
- Modify: `apps/web/src/components/layout/sidebar-nav.tsx:5` — add Network import + nav item

- [ ] **Step 1: Create Graph tab server page**

Follow same pattern as `apps/web/src/app/(workspace)/memory/page.tsx`. Fetch dashboard, check >= 8 items, render `GraphPageContent` or `EmptyState`.

```typescript
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { PageTelemetry } from "@/components/telemetry/page-telemetry";
import { GraphPageContent } from "@/features/graph/graph-page-content";
import { requirePageViewer } from "@/server/policies/viewer";
import {
  getProjectDashboardForUser,
  listProjectsForUser,
} from "@/server/services/project-service";

export const dynamic = "force-dynamic";

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const viewer = await requirePageViewer("/graph");
  const projects = await listProjectsForUser(viewer.userId);

  if (projects.length === 0) {
    redirect("/dashboard");
  }

  const { project: selectedProjectId } = await searchParams;
  const currentProject =
    (selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : projects[0]) ?? projects[0]!;

  const dashboard = await getProjectDashboardForUser(
    viewer.userId,
    currentProject.id,
  );

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        pageName="graph"
        pageGroup="workspace"
        message="Rendered the graph page."
        context={{ projectId: currentProject.id }}
      />
      {dashboard && dashboard.memory.length >= 8 ? (
        <GraphPageContent
          project={{ id: currentProject.id, name: currentProject.name }}
          dashboard={dashboard}
        />
      ) : (
        <EmptyState
          title="Not enough memory items"
          description="The graph view needs at least 8 memory items to be useful. Keep chatting and Relay will build up your project memory."
          className="py-12"
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Create Graph page client content**

```typescript
"use client";

import type { ProjectDashboardDto } from "@relay/shared";

import { MemoryGraphContainer } from "./memory-graph-container";

interface GraphPageContentProps {
  project: { id: string; name: string };
  dashboard: ProjectDashboardDto;
}

export function GraphPageContent({ project, dashboard }: GraphPageContentProps) {
  return (
    <div className="pt-6">
      <MemoryGraphContainer
        projectId={project.id}
        memoryItems={dashboard.memory}
        initialFullscreen
      />
    </div>
  );
}
```

- [ ] **Step 3: Add Graph tab to sidebar nav**

In `apps/web/src/components/layout/sidebar-nav.tsx`:

Add `Network` to the lucide-react import on line 5:
```typescript
import { LayoutDashboard, Activity, Brain, FileDown, BookOpen, Network } from "lucide-react";
```

Add `graphHref` after `memoryHref` (around line 31):
```typescript
const graphHref = currentProjectId
  ? `/graph?project=${currentProjectId}`
  : "/graph";
```

Add nav item after Memory in `navItems` array (around line 53):
```typescript
{
  href: graphHref,
  label: "Graph",
  icon: <Network className="h-4 w-4" />,
  requiresProject: true,
},
```

- [ ] **Step 4: Commit**

Stage all three files and commit with message: `feat(graph): add Graph tab with route, page content, and sidebar nav entry`

---

### Task 9: Dashboard minimap card + memory tab integration

**Files:**
- Create: `apps/web/src/features/projects/dashboard-graph-minimap.tsx`
- Modify: `apps/web/src/features/projects/dashboard-content.tsx`
- Modify: `apps/web/src/features/memory/memory-page-content.tsx`

- [ ] **Step 1: Create minimap card**

```typescript
"use client";

import { Network } from "lucide-react";
import type { MemoryItemDto } from "@relay/shared";

import { MemoryGraphContainer } from "@/features/graph/memory-graph-container";

interface DashboardGraphMinimapProps {
  projectId: string;
  memoryItems: MemoryItemDto[];
}

export function DashboardGraphMinimap({ projectId, memoryItems }: DashboardGraphMinimapProps) {
  if (memoryItems.length < 8) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Network className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
        <span className="text-[12px] font-medium text-[var(--relay-ink)]">Memory Graph</span>
      </div>
      <MemoryGraphContainer projectId={projectId} memoryItems={memoryItems} />
    </div>
  );
}
```

- [ ] **Step 2: Add minimap to dashboard**

In `apps/web/src/features/projects/dashboard-content.tsx`:

Add import:
```typescript
import { DashboardGraphMinimap } from "@/features/projects/dashboard-graph-minimap";
```

Add after governance summary `FadeIn` block (around line 410, before the edit dialog):
```tsx
<FadeIn delay={0.25}>
  <DashboardGraphMinimap
    projectId={project.id}
    memoryItems={dashboard.memory}
  />
</FadeIn>
```

- [ ] **Step 3: Add graph to memory tab**

In `apps/web/src/features/memory/memory-page-content.tsx`:

Add import:
```typescript
import { MemoryGraphContainer } from "@/features/graph/memory-graph-container";
```

Add after Memory Health section (after line 167, before the Project State section):
```tsx
{dashboard.memory.length >= 8 && (
  <FadeIn delay={0.04}>
    <MemoryGraphContainer
      projectId={project.id}
      memoryItems={dashboard.memory}
    />
  </FadeIn>
)}
```

- [ ] **Step 4: Commit**

Stage all three files and commit with message: `feat(graph): add minimap to dashboard + compact graph to memory tab`

---

### Task 10: Verify end-to-end

- [ ] **Step 1: Start dev server**

Run: `pnpm dev --filter @relay/web`

- [ ] **Step 2: Test Graph tab**

Navigate to Graph tab. Verify: graph renders, nodes colored by type with glow, edges visible, click opens detail panel, drag nodes, zoom in/out affects labels, Exit button works.

- [ ] **Step 3: Test Memory tab**

Navigate to Memory tab. Verify compact graph preview when >= 8 items, hover shows "Open graph", click opens fullscreen.

- [ ] **Step 4: Test Overview tab**

Navigate to Dashboard. Verify minimap card appears, click opens fullscreen.

- [ ] **Step 5: Test detail panel**

In fullscreen: click node, verify panel content (type/title/metadata/content/relations/actions), test Edit/Pin/Archive, test relation navigation.

- [ ] **Step 6: Test dark + light mode**

Toggle theme, verify graph adapts.

- [ ] **Step 7: Fix issues and final commit**

Fix any issues found. Stage and commit with message: `fix(graph): address issues found during verification`
