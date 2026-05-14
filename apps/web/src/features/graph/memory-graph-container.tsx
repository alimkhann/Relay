"use client";

import dynamic from "next/dynamic";
import type { MemoryItemDto } from "@relay/shared";
import { ChevronDown, Expand, Minimize2, Network, RotateCcw, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { relayClientFetch } from "@/lib/telemetry/fetch";
import { MemoryGraphDetailPanel } from "./memory-graph-detail-panel";
import {
  DEFAULT_GRAPH_SETTINGS,
  TYPE_COLORS,
  TYPE_LABELS,
  type MemoryGraphSettings,
  type GraphNode,
} from "./memory-graph-utils";
import { useGraphData } from "./use-graph-data";

const MemoryGraph = dynamic(
  () => import("./memory-graph").then((module) => ({ default: module.MemoryGraph })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-[12px] text-[var(--relay-muted)]">
        Loading graph...
      </div>
    ),
  },
);

interface MemoryGraphContainerProps {
  projectId: string;
  projectName?: string;
  memoryItems: MemoryItemDto[];
  mode?: "compact" | "fullscreen";
  variant?: "default" | "minimap";
  title?: string;
  className?: string;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (box) {
        setSize({ width: box.width, height: box.height });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

function GraphLegend({ nodeCount, linkCount }: { nodeCount: number; linkCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--relay-muted)]">
      {(Object.keys(TYPE_COLORS) as Array<keyof typeof TYPE_COLORS>).map((type) => (
        <span key={type} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[type] }} />
          {TYPE_LABELS[type]}
        </span>
      ))}
      <span className="text-[var(--relay-line)]">·</span>
      <span>{nodeCount} nodes</span>
      <span>{linkCount} edges</span>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] text-[var(--relay-ink-secondary)]">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--relay-ink)]"
      />
    </label>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[12px] text-[var(--relay-ink-secondary)]">
        <span>{label}</span>
        <span className="font-mono text-[11px] text-[var(--relay-muted)]">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--relay-ink)]"
      />
    </label>
  );
}

function GraphSettingsPanel({
  settings,
  onChange,
  onReset,
  onClose,
}: {
  settings: MemoryGraphSettings;
  onChange: (settings: MemoryGraphSettings) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  function patch(partial: Partial<MemoryGraphSettings>) {
    onChange({ ...settings, ...partial });
  }

  return (
    <aside className="absolute right-4 top-16 z-30 w-[min(290px,calc(100%-32px))] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]/92 p-3 text-[var(--relay-ink)] shadow-[var(--relay-shadow-lg)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Settings2 className="h-4 w-4 text-[var(--relay-muted)]" />
          Graph Settings
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReset}
            className="rounded-full p-1.5 text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            aria-label="Reset graph settings"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            aria-label="Close graph settings"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-3">
          <p className="border-b border-[var(--relay-line)] pb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--relay-muted)]">Display</p>
          <ToggleRow label="Arrows" checked={settings.showArrows} onChange={(showArrows) => patch({ showArrows })} />
          <ToggleRow label="Labels" checked={settings.showLabels} onChange={(showLabels) => patch({ showLabels })} />
          <ToggleRow label="Fallback links" checked={settings.showFallbackLinks} onChange={(showFallbackLinks) => patch({ showFallbackLinks })} />
          <SliderRow label="Text fade threshold" min={0.75} max={2.2} step={0.05} value={settings.textFadeThreshold} onChange={(textFadeThreshold) => patch({ textFadeThreshold })} />
          <SliderRow label="Node size" min={0.45} max={1.7} step={0.05} value={settings.nodeScale} onChange={(nodeScale) => patch({ nodeScale })} />
          <SliderRow label="Link thickness" min={0.35} max={2.2} step={0.05} value={settings.linkThickness} onChange={(linkThickness) => patch({ linkThickness })} />
          <ToggleRow label="Animate" checked={settings.animate} onChange={(animate) => patch({ animate })} />
        </div>

        <div className="space-y-3">
          <p className="border-b border-[var(--relay-line)] pb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--relay-muted)]">Forces</p>
          <SliderRow label="Center force" min={0} max={1.2} step={0.05} value={settings.centerForce} onChange={(centerForce) => patch({ centerForce })} />
          <SliderRow label="Repel force" min={20} max={260} step={5} value={settings.repelForce} onChange={(repelForce) => patch({ repelForce })} />
          <SliderRow label="Link force" min={0.02} max={1} step={0.02} value={settings.linkForce} onChange={(linkForce) => patch({ linkForce })} />
          <SliderRow label="Link distance" min={20} max={180} step={5} value={settings.linkDistance} onChange={(linkDistance) => patch({ linkDistance })} />
        </div>
      </div>
    </aside>
  );
}

interface ProjectListItem {
  id: string;
  name: string;
}

export function MemoryGraphContainer({
  projectId,
  projectName,
  memoryItems,
  mode = "compact",
  variant = "default",
  title = "Memory Graph",
  className,
}: MemoryGraphContainerProps) {
  const [expanded, setExpanded] = useState(mode === "fullscreen");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(mode === "fullscreen");
  const [settings, setSettings] = useState<MemoryGraphSettings>(DEFAULT_GRAPH_SETTINGS);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [activeProjectId, setActiveProjectId] = useState(projectId);
  const [switchedItems, setSwitchedItems] = useState<MemoryItemDto[] | null>(null);
  const compactSize = useElementSize<HTMLDivElement>();
  const fullscreenSize = useElementSize<HTMLDivElement>();

  const effectiveItems = activeProjectId === projectId ? memoryItems : (switchedItems ?? []);
  const activeProjectName = activeProjectId === projectId
    ? projectName
    : projects.find((p) => p.id === activeProjectId)?.name;
  const { data, loading, error } = useGraphData(activeProjectId, effectiveItems, activeProjectName);

  useEffect(() => {
    if (!expanded) return;
    void (async () => {
      try {
        const res = await relayClientFetch("/api/projects");
        if (res.ok) {
          const payload = (await res.json()) as { projects: ProjectListItem[] };
          setProjects(payload.projects);
        }
      } catch {}
    })();
  }, [expanded]);

  useEffect(() => {
    if (activeProjectId === projectId) {
      setSwitchedItems(null);
      return;
    }
    void (async () => {
      try {
        const res = await relayClientFetch(`/api/projects/${activeProjectId}/memory`);
        if (res.ok) {
          const payload = (await res.json()) as { memory: Array<{
            id: string; type: MemoryItemDto["type"]; title: string | null;
            content: string; pinned: boolean; updatedAt?: string;
            provenance?: { sourceSurface?: string | null; sourceUrl?: string | null; capturedAt?: string | null };
            status?: { lastReaffirmedAt?: string | null };
          }> };
          setSwitchedItems(payload.memory.map((i) => ({
            id: i.id,
            type: i.type,
            title: i.title,
            content: i.content,
            pinned: i.pinned,
            updatedAt: i.updatedAt ?? new Date().toISOString(),
            sourceSurface: (i.provenance?.sourceSurface as MemoryItemDto["sourceSurface"]) ?? null,
            sourceUrl: i.provenance?.sourceUrl ?? null,
            capturedAt: i.provenance?.capturedAt ?? null,
            decayScore: 0.5,
            lastReaffirmedAt: i.status?.lastReaffirmedAt ?? null,
          })));
        }
      } catch {}
    })();
  }, [activeProjectId, projectId]);

  function selectNode(node: GraphNode | null) {
    setSelectedNode(node);
    if (node) {
      setSettingsOpen(false);
    }
  }

  function renderGraphBody(surface: "compact" | "fullscreen") {
    const isFullscreen = surface === "fullscreen";
    const size = isFullscreen ? fullscreenSize.size : compactSize.size;
    const isMinimap = variant === "minimap" && !isFullscreen;

    return (
    <div
      ref={isFullscreen ? fullscreenSize.ref : compactSize.ref}
      className={cn(
        "relative overflow-hidden rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[radial-gradient(circle_at_25%_15%,rgba(59,130,246,0.14),transparent_28%),radial-gradient(circle_at_76%_86%,rgba(16,185,129,0.13),transparent_30%),var(--relay-bg)]",
        isFullscreen ? "h-full border-0" : isMinimap ? "h-full min-h-[120px]" : "h-[320px]",
      )}
    >
      {error && (
        <div className="absolute left-3 top-3 z-10 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-500">
          {error}
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--relay-bg)]/35 text-[12px] text-[var(--relay-muted)] backdrop-blur-sm">
          Loading graph...
        </div>
      )}
      <MemoryGraph
        data={data}
        width={size.width}
        height={size.height}
        selectedNodeId={selectedNode?.id ?? null}
        settings={settings}
        onSelectNode={selectNode}
      />
      {!isFullscreen && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full border border-[var(--relay-line)] bg-[var(--relay-surface)]/90 p-1.5 font-medium text-[var(--relay-ink)] shadow-[var(--relay-shadow-sm)] backdrop-blur opacity-0 hover:opacity-100 transition-opacity"
          aria-label="Open memory graph fullscreen"
        >
          <Expand className="h-3.5 w-3.5" />
        </button>
      )}
      {settingsOpen && isFullscreen && (
        <GraphSettingsPanel
          settings={settings}
          onChange={setSettings}
          onReset={() => setSettings(DEFAULT_GRAPH_SETTINGS)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <MemoryGraphDetailPanel
        node={selectedNode}
        links={data.links}
        allNodes={data.nodes}
        onClose={() => setSelectedNode(null)}
        onSelectNode={selectNode}
      />
    </div>
    );
  }

  return (
    <>
      {mode !== "fullscreen" && (
        <section className={cn(
          "rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]",
          variant === "minimap" ? "h-full min-h-[152px] p-2" : "p-3",
          className,
        )}>
          {variant !== "minimap" && (
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--relay-ink)]">
                  <Network className="h-4 w-4 text-[var(--relay-muted)]" />
                  {title}
                </div>
                <div className="mt-1">
                  <GraphLegend nodeCount={data.nodes.length} linkCount={data.links.length} />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setExpanded(true)}
              >
                <Expand className="h-3.5 w-3.5" />
                <span className="sr-only">Open graph</span>
              </Button>
            </div>
          )}
          {renderGraphBody("compact")}
        </section>
      )}

      {expanded && (
        <div className="fixed inset-0 z-50 bg-[var(--relay-bg)]">
          <div className="absolute left-4 top-4 z-20 flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-2 bg-[var(--relay-surface)]/80 backdrop-blur"
              onClick={() => {
                if (mode === "fullscreen") {
                  history.back();
                  return;
                }
                setExpanded(false);
                setSelectedNode(null);
              }}
            >
              <Minimize2 className="h-4 w-4" />
              Exit
            </Button>
            {projects.length > 1 ? (
              <div className="relative">
                <select
                  value={activeProjectId}
                  onChange={(e) => {
                    setActiveProjectId(e.target.value);
                    setSelectedNode(null);
                  }}
                  className="appearance-none rounded-full border border-[var(--relay-line)] bg-[var(--relay-surface)]/80 pl-3 pr-7 py-1.5 text-[12px] font-medium text-[var(--relay-ink)] backdrop-blur outline-none cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--relay-muted)]" />
              </div>
            ) : (
              <div className="rounded-full border border-[var(--relay-line)] bg-[var(--relay-surface)]/80 px-3 py-1.5 text-[12px] font-medium text-[var(--relay-ink)] backdrop-blur">
                {title}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className="absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-surface)]/90 text-[var(--relay-muted)] shadow-[var(--relay-shadow-sm)] backdrop-blur transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            aria-label="Graph settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <div className="absolute bottom-4 left-4 z-20 max-w-[calc(100%-32px)] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]/88 px-3 py-2 backdrop-blur">
            <GraphLegend nodeCount={data.nodes.length} linkCount={data.links.length} />
          </div>
          <div className="h-full">
            {renderGraphBody("fullscreen")}
          </div>
        </div>
      )}
    </>
  );
}
