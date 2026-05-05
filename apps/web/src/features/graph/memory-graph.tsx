"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";

import {
  graphEndpointId,
  labelOpacity,
  nodeOpacity,
  nodeRadius,
  RELATION_COLORS,
  TYPE_COLORS,
  type MemoryGraphSettings,
  type GraphData,
  type GraphLink,
  type GraphNode,
} from "./memory-graph-utils";

interface MemoryGraphProps {
  data: GraphData;
  width: number;
  height: number;
  compact?: boolean;
  selectedNodeId?: string | null;
  settings: MemoryGraphSettings;
  onSelectNode?: (node: GraphNode | null) => void;
}

function hasPosition(node: GraphNode): node is GraphNode & { x: number; y: number } {
  return typeof node.x === "number" && typeof node.y === "number";
}

function cssVar(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function drawLabelPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  globalScale: number,
) {
  const scale = 1 / Math.max(globalScale, 0.01);
  const fontSize = compactNumber(11 * scale, 9 * scale, 12 * scale);
  const paddingX = 7 * scale;
  const paddingY = 4 * scale;
  const maxWidth = 136 * scale;
  ctx.font = `500 ${fontSize}px Outfit, sans-serif`;
  const metrics = ctx.measureText(text);
  const width = Math.min(metrics.width, maxWidth) + paddingX * 2;
  const height = fontSize + paddingY * 2;
  const left = x - width / 2;
  const top = y;
  const radius = 7 * scale;
  const bg = cssVar("--relay-surface", "#ffffff");
  const border = cssVar("--relay-line", "rgba(0,0,0,0.12)");
  const ink = cssVar("--relay-ink", "#0f0f0f");

  ctx.save();
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1 / globalScale;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, radius);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, top + height / 2, maxWidth);
  ctx.restore();
}

function drawLabelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  globalScale: number,
) {
  const scale = 1 / Math.max(globalScale, 0.01);
  const fontSize = compactNumber(10.5 * scale, 7.5 * scale, 11 * scale);
  const maxWidth = 128 * scale;
  const ink = cssVar("--relay-ink", "#0f0f0f");
  const halo = cssVar("--relay-surface", "#ffffff");

  ctx.save();
  ctx.font = `500 ${fontSize}px Outfit, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = halo;
  ctx.strokeText(text, x, y, maxWidth);
  ctx.fillStyle = ink;
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}

function compactNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function MemoryGraph({
  data,
  width,
  height,
  compact = false,
  selectedNodeId,
  settings,
  onSelectNode,
}: MemoryGraphProps) {
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const didFitRef = useRef(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const activeNodeId = selectedNodeId ?? hoveredNodeId;

  const visibleLinks = useMemo(() => {
    return settings.showFallbackLinks ? data.links : data.links.filter((link) => !link.fallback);
  }, [data.links, settings.showFallbackLinks]);

  const graphData = useMemo(() => ({
    nodes: data.nodes,
    links: visibleLinks,
  }), [data.nodes, visibleLinks]);

  useEffect(() => {
    const graph = graphRef.current as
      | (ForceGraphMethods<GraphNode, GraphLink> & {
          d3Force?: (name: string) => {
            strength?: (value: number) => unknown;
            distance?: (value: number) => unknown;
          } | undefined;
          d3ReheatSimulation?: () => void;
        })
      | undefined;

    if (!graph) return;

    graph.d3Force?.("charge")?.strength?.(-settings.repelForce);
    graph.d3Force?.("link")?.distance?.(settings.linkDistance);
    graph.d3Force?.("link")?.strength?.(settings.linkForce);
    graph.d3Force?.("center")?.strength?.(settings.centerForce);
    graph.d3ReheatSimulation?.();
  }, [settings.centerForce, settings.linkDistance, settings.linkForce, settings.repelForce, visibleLinks.length]);

  const connected = useMemo(() => {
    const nodes = new Set<string>();
    const links = new Set<GraphLink>();
    if (!activeNodeId) return { nodes, links };

    nodes.add(activeNodeId);
    for (const link of visibleLinks) {
      const sourceId = graphEndpointId(link.source);
      const targetId = graphEndpointId(link.target);
      if (sourceId === activeNodeId || targetId === activeNodeId) {
        links.add(link);
        nodes.add(sourceId);
        nodes.add(targetId);
      }
    }
    return { nodes, links };
  }, [activeNodeId, visibleLinks]);

  const drawNode = useCallback((
    node: GraphNode,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
  ) => {
    if (!hasPosition(node)) return;

    const color = TYPE_COLORS[node.type];
    const isActive = activeNodeId === node.id;
    const isAdjacent = connected.nodes.has(node.id);
    const shouldDim = Boolean(activeNodeId) && !isAdjacent;
    const baseRadius = nodeRadius(node.decayScore, settings.nodeScale);
    const radius = isActive || hoveredNodeId === node.id ? baseRadius + 1.6 : baseRadius;
    const opacity = shouldDim ? 0.18 : nodeOpacity(node.decayScore);
    const ringColor = "rgba(245,245,245,0.7)";

    ctx.save();
    ctx.globalAlpha = shouldDim ? 0.035 : Math.min(0.12, 0.035 + node.decayScore * 0.085);
    const gradient = ctx.createRadialGradient(node.x, node.y, radius * 0.2, node.x, node.y, radius * 2.6);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.14, color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius * 1.75, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = shouldDim ? 0.18 : 0.5;
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 1.4 / globalScale;
    ctx.stroke();

    if (isActive) {
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2 / globalScale;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 4 / globalScale, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (!compact && settings.showLabels) {
      const textOpacity = isActive || hoveredNodeId === node.id ? 1 : labelOpacity(globalScale, settings.textFadeThreshold);
      if (textOpacity > 0.02) {
        ctx.globalAlpha = shouldDim ? 0.14 : textOpacity;
        if (isActive || hoveredNodeId === node.id) {
          drawLabelPill(ctx, node.label, node.x, node.y + radius + 6 / globalScale, globalScale);
        } else {
          drawLabelText(ctx, node.label, node.x, node.y + radius + 4 / globalScale, globalScale);
        }
      }
    }

    ctx.restore();
  }, [activeNodeId, compact, connected.nodes, hoveredNodeId, settings.nodeScale, settings.showLabels, settings.textFadeThreshold]);

  const drawLink = useCallback((
    link: GraphLink,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
  ) => {
    const source = link.source;
    const target = link.target;
    if (typeof source === "string" || typeof target === "string") return;
    if (!hasPosition(source) || !hasPosition(target)) return;

    const isHighlighted = connected.links.has(link);
    const hasActive = Boolean(activeNodeId);
    const color = isHighlighted ? RELATION_COLORS[link.relationType] : "rgba(107,114,128,0.9)";
    const alpha = isHighlighted ? 0.84 : hasActive ? 0.2 : link.relationType === "similar" ? 0.42 : 0.52;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = ((isHighlighted ? 1.55 : 0.86) * settings.linkThickness) / globalScale;
    if (link.relationType === "similar") {
      ctx.setLineDash([4 / globalScale, 5 / globalScale]);
    }
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (settings.showArrows && link.relationType !== "similar" && !compact) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const size = 4 / globalScale;
      ctx.translate(midX, midY);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size, -size * 0.65);
      ctx.lineTo(-size, size * 0.65);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }, [activeNodeId, compact, connected.links, settings.linkThickness, settings.showArrows]);

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={graphData}
      width={Math.max(width, 1)}
      height={Math.max(height, 1)}
      backgroundColor="rgba(0,0,0,0)"
      nodeId="id"
      nodeRelSize={1}
      nodeCanvasObject={drawNode}
      linkCanvasObjectMode={() => "replace"}
      linkCanvasObject={drawLink}
      linkDirectionalParticles={(link) => settings.animate && activeNodeId && connected.links.has(link) ? 1 : 0}
      linkDirectionalParticleWidth={1.8}
      linkDirectionalParticleSpeed={0.004}
      cooldownTicks={compact ? 80 : settings.animate ? 220 : 110}
      d3AlphaDecay={0.025}
      d3VelocityDecay={0.34}
      enableNodeDrag={!compact}
      enablePanInteraction={!compact}
      enableZoomInteraction={!compact}
      minZoom={compact ? 0.55 : 0.32}
      maxZoom={compact ? 1.8 : 2.4}
      onNodeHover={(node) => setHoveredNodeId(node?.id ?? null)}
      onNodeClick={(node) => onSelectNode?.(node)}
      onNodeDragEnd={(node) => {
        node.fx = undefined;
        node.fy = undefined;
        (
          graphRef.current as
            | (ForceGraphMethods<GraphNode, GraphLink> & {
                d3ReheatSimulation?: () => void;
              })
            | undefined
        )?.d3ReheatSimulation?.();
      }}
      onBackgroundClick={() => onSelectNode?.(null)}
      onZoom={({ k }) => setZoom(k)}
      onEngineStop={() => {
        if (!didFitRef.current) {
          didFitRef.current = true;
          graphRef.current?.zoomToFit(350, compact ? 24 : 72);
        }
      }}
      nodePointerAreaPaint={(node, color, ctx) => {
        if (!hasPosition(node)) return;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius(node.decayScore, settings.nodeScale) + 6 / zoom, 0, Math.PI * 2);
        ctx.fill();
      }}
    />
  );
}
