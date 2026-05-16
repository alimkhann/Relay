"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";

import {
  graphEndpointId,
  isHubNode,
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

// Clip by characters, not by a canvas maxWidth. Passing maxWidth to
// fillText horizontally *condenses* the glyphs (the "squished" look that
// gets worse the more the label has to shrink); truncating the string keeps
// every glyph at its natural aspect ratio at any zoom.
function truncateLabel(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function drawLabelPill(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  x: number,
  y: number,
  globalScale: number,
) {
  const scale = 1 / Math.max(globalScale, 0.01);
  const fontSize = compactNumber(11 * scale, 9 * scale, 12 * scale);
  const paddingX = 7 * scale;
  const paddingY = 4 * scale;
  const text = truncateLabel(rawText, 28);
  ctx.font = `500 ${fontSize}px Outfit, sans-serif`;
  const metrics = ctx.measureText(text);
  const width = metrics.width + paddingX * 2;
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
  ctx.fillText(text, x, top + height / 2);
  ctx.restore();
}

function drawLabelText(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  x: number,
  y: number,
  globalScale: number,
) {
  const scale = 1 / Math.max(globalScale, 0.01);
  const fontSize = compactNumber(10.5 * scale, 7.5 * scale, 11 * scale);
  const text = truncateLabel(rawText, 30);
  const ink = cssVar("--relay-ink", "#0f0f0f");
  const halo = cssVar("--relay-surface", "#ffffff");

  ctx.save();
  ctx.font = `500 ${fontSize}px Outfit, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = halo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = ink;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// World-space card dimensions. Sized in graph coordinates (like circular nodes
// via nodeRadius) so the card zooms naturally with the view and participates in
// the force layout instead of ballooning at low zoom and overlapping neighbours.
export function sourceFileNodeSize(nodeScale = 1) {
  const u = Math.max(0.45, nodeScale);
  return { width: 30 * u, height: 19 * u, radius: 3.4 * u };
}

function drawSourceFileNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode & { x: number; y: number },
  globalScale: number,
  active: boolean,
  nodeScale: number,
) {
  const u = Math.max(0.45, nodeScale);
  const { width, height, radius } = sourceFileNodeSize(nodeScale);
  const left = node.x - width / 2;
  const top = node.y - height / 2;
  const surface = cssVar("--relay-surface", "#ffffff");
  const soft = cssVar("--relay-soft", "#f4f4f5");
  const border = cssVar("--relay-line", "rgba(0,0,0,0.12)");
  const ink = cssVar("--relay-ink", "#111827");
  const muted = cssVar("--relay-muted", "#71717a");
  const accent = "#0ea5e9";

  ctx.save();
  ctx.shadowColor = "rgba(14,165,233,0.20)";
  ctx.shadowBlur = active ? 2 * u : 1 * u;
  ctx.fillStyle = surface;
  ctx.strokeStyle = active ? accent : border;
  ctx.lineWidth = (active ? 2 : 1) / globalScale;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, radius);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = soft;
  ctx.beginPath();
  ctx.roundRect(left + 1.6 * u, top + 1.6 * u, width - 3.2 * u, 4.6 * u, 1.9 * u);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(left + 2.9 * u, top + 2.9 * u, 2.5 * u, 2.3 * u, 0.7 * u);
  ctx.fill();

  ctx.font = `700 ${2.1 * u}px Outfit, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ink;
  ctx.fillText(node.source?.displayName ?? node.label, left + 6.4 * u, top + 3.9 * u, width - 8.6 * u);

  ctx.font = `500 ${1.55 * u}px Outfit, sans-serif`;
  ctx.fillStyle = muted;
  ctx.fillText(
    `${node.source?.chunkCount ?? 0} chunks · ${node.source?.tokenEstimate ?? 0} tokens`,
    left + 2.7 * u,
    top + 8.4 * u,
    width - 5.4 * u,
  );

  const preview = (node.source?.previewText || node.content).replace(/\s+/g, " ").trim();
  ctx.font = `400 ${1.55 * u}px Outfit, sans-serif`;
  ctx.fillStyle = muted;
  const maxPreviewWidth = width - 5.4 * u;
  const words = preview.split(" ");
  let previewLine = "";
  let y = top + 11.7 * u;
  let lines = 0;
  for (const word of words) {
    const next = previewLine ? `${previewLine} ${word}` : word;
    if (ctx.measureText(next).width > maxPreviewWidth && previewLine) {
      ctx.fillText(previewLine, left + 2.7 * u, y, maxPreviewWidth);
      previewLine = word;
      y += 2.3 * u;
      lines += 1;
      if (lines >= 2) break;
    } else {
      previewLine = next;
    }
  }
  if (previewLine && lines < 3) {
    ctx.fillText(previewLine, left + 2.7 * u, y, maxPreviewWidth);
  }

  ctx.restore();
}

function compactNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function MemoryGraph({
  data,
  width,
  height,
  selectedNodeId,
  settings,
  onSelectNode,
}: MemoryGraphProps) {
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const didFitRef = useRef(false);
  const prevDimsRef = useRef({ w: 0, h: 0 });
  const prevNodeCountRef = useRef(0);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // When mounted inside a hidden/animated container (Overview minimap, Memory
  // tab) the element first measures 0x0, so the canvas renders at 1x1 and the
  // one-shot zoomToFit fits to nothing — the graph looks blank. Re-fit whenever
  // dimensions become valid after being unmeasured.
  useEffect(() => {
    if (width <= 1 || height <= 1) return;
    const prev = prevDimsRef.current;
    prevDimsRef.current = { w: width, h: height };
    if (prev.w > 1 && prev.h > 1) return;
    didFitRef.current = false;
    const frame = requestAnimationFrame(() => {
      graphRef.current?.zoomToFit(300, 40);
      didFitRef.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [width, height]);

  const activeNodeId = selectedNodeId ?? hoveredNodeId;

  const visibleLinks = useMemo(() => {
    return settings.showFallbackLinks ? data.links : data.links.filter((link) => !link.fallback);
  }, [data.links, settings.showFallbackLinks]);

  const graphData = useMemo(() => ({
    nodes: data.nodes,
    links: visibleLinks,
  }), [data.nodes, visibleLinks]);

  // Data can arrive after the canvas has already mounted + fit on an empty
  // graph. Re-fit on the 0 -> N transition so nodes are framed, not blank.
  useEffect(() => {
    const count = graphData.nodes.length;
    const prev = prevNodeCountRef.current;
    prevNodeCountRef.current = count;
    if (prev === 0 && count > 0 && width > 1 && height > 1) {
      didFitRef.current = false;
      const frame = requestAnimationFrame(() => {
        graphRef.current?.zoomToFit(300, 40);
        didFitRef.current = true;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [graphData.nodes.length, width, height]);

  useEffect(() => {
    const graph = graphRef.current as
      | (ForceGraphMethods<GraphNode, GraphLink> & {
          d3Force?: (name: string) => {
            strength?: (value: number | ((link: GraphLink) => number)) => unknown;
            distance?: (value: number | ((link: GraphLink) => number)) => unknown;
          } | undefined;
          d3ReheatSimulation?: () => void;
        })
      | undefined;

    if (!graph) return;

    graph.d3Force?.("charge")?.strength?.(-settings.repelForce);
    graph.d3Force?.("link")?.distance?.((link: GraphLink) => {
      if (link.hubLink === "root-to-hub") return settings.linkDistance * 1.8;
      if (link.hubLink === "hub-to-item") return settings.linkDistance * 0.7;
      return settings.linkDistance;
    });
    graph.d3Force?.("link")?.strength?.((link: GraphLink) => {
      if (link.hubLink) return settings.linkForce * 1.2;
      return settings.linkForce;
    });
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

    const isHub = isHubNode(node);
    const color = node.hub === "root" ? "#94a3b8" : TYPE_COLORS[node.type];
    const isActive = activeNodeId === node.id;

    if (node.kind === "source-file") {
      drawSourceFileNode(ctx, node, globalScale, isActive || hoveredNodeId === node.id, settings.nodeScale);
      return;
    }

    if (isHub) {
      const hubRadius = node.hub === "root" ? 12 * settings.nodeScale : 8 * settings.nodeScale;
      const radius = isActive || hoveredNodeId === node.id ? hubRadius + 2 : hubRadius;
      const opacity = 0.92;

      ctx.save();

      // Glow
      ctx.globalAlpha = 0.15;
      const glow = ctx.createRadialGradient(node.x, node.y, radius * 0.3, node.x, node.y, radius * 3);
      glow.addColorStop(0, color);
      glow.addColorStop(0.2, color);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Fill
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Ring
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.8 / globalScale;
      ctx.stroke();

      if (isActive) {
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5 / globalScale;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 5 / globalScale, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Label inside hub
      const scale = 1 / Math.max(globalScale, 0.01);
      const fontSize = node.hub === "root"
        ? compactNumber(11 * scale, 8 * scale, 13 * scale)
        : compactNumber(9 * scale, 6.5 * scale, 10 * scale);
      ctx.globalAlpha = 0.95;
      ctx.font = `600 ${fontSize}px Outfit, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(node.label, node.x, node.y, radius * 2.2);

      ctx.restore();
      return;
    }

    // Regular item nodes
    const baseRadius = nodeRadius(node.decayScore, settings.nodeScale);
    const radius = isActive || hoveredNodeId === node.id ? baseRadius + 1.6 : baseRadius;
    const archiveFade = node.archived ? 0.4 : 1;
    const opacity = nodeOpacity(node.decayScore) * archiveFade;
    const ringColor = "rgba(245,245,245,0.7)";

    ctx.save();
    ctx.globalAlpha = Math.min(0.12, 0.035 + node.decayScore * 0.085);
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
    ctx.globalAlpha = 0.5;
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

    if (settings.showLabels) {
      const textOpacity = isActive || hoveredNodeId === node.id ? 1 : labelOpacity(globalScale, settings.textFadeThreshold);
      if (textOpacity > 0.02) {
        ctx.globalAlpha = textOpacity;
        if (isActive || hoveredNodeId === node.id) {
          drawLabelPill(ctx, node.label, node.x, node.y + radius + 6 / globalScale, globalScale);
        } else {
          drawLabelText(ctx, node.label, node.x, node.y + radius + 4 / globalScale, globalScale);
        }
      }
    }

    ctx.restore();
  }, [activeNodeId, connected.nodes, hoveredNodeId, settings.nodeScale, settings.showLabels, settings.textFadeThreshold]);

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
    const isHub = Boolean(link.hubLink);
    const color = isHighlighted ? RELATION_COLORS[link.relationType] : "rgba(107,114,128,0.9)";
    const alpha = isHighlighted ? 0.84 : isHub ? 0.18 : link.relationType === "similar" ? 0.35 : 0.45;

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

    if (settings.showArrows && link.relationType !== "similar") {
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
  }, [activeNodeId, connected.links, settings.linkThickness, settings.showArrows]);

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
      cooldownTicks={settings.animate ? 220 : 110}
      d3AlphaDecay={0.018}
      d3VelocityDecay={0.45}
      enableNodeDrag
      enablePanInteraction
      enableZoomInteraction
      minZoom={0.32}
      maxZoom={8}
      onNodeHover={(node) => setHoveredNodeId(node?.id ?? null)}
      onNodeClick={(node) => onSelectNode?.(node)}
      onNodeDragEnd={(node) => {
        // Sticky drag: the lib pins fx/fy to the cursor during the drag; keep
        // them pinned at the drop point (instead of clearing them) so the
        // user-set position actually persists. Reheat so every *other* node
        // relaxes around it with full force behavior.
        node.fx = node.x;
        node.fy = node.y;
        (graphRef.current as { d3ReheatSimulation?: () => void } | undefined)?.d3ReheatSimulation?.();
      }}
      onBackgroundClick={() => onSelectNode?.(null)}
      onZoom={({ k }) => setZoom(k)}
      onEngineStop={() => {
        if (!didFitRef.current) {
          didFitRef.current = true;
          graphRef.current?.zoomToFit(350, 40);
        }
      }}
      nodePointerAreaPaint={(node, color, ctx) => {
        if (!hasPosition(node)) return;
        if (node.kind === "source-file") {
          const { width, height, radius } = sourceFileNodeSize(settings.nodeScale);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(node.x - width / 2, node.y - height / 2, width, height, radius);
          ctx.fill();
          return;
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius(node.decayScore, settings.nodeScale) + 6 / zoom, 0, Math.PI * 2);
        ctx.fill();
      }}
    />
  );
}
