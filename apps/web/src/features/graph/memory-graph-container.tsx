"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { MemoryItemDto, MemoryItemType, ProjectGraphEdgeKind, ProjectGraphNodeKind } from "@relay/shared";
import {
  PERSONAL_CATEGORY_META,
  personalCategoryFromMetadata,
  type PersonalCategory,
} from "@relay/shared/constants/memory-taxonomy";
import { ChevronDown, Expand, Minimize2, Network, RotateCcw, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { relayClientFetch } from "@/lib/telemetry/fetch";
import { MemoryGraphDetailPanel } from "./memory-graph-detail-panel";
import {
  DEFAULT_GRAPH_SETTINGS,
  NODE_KIND_LABELS,
  TYPE_COLORS,
  TYPE_LABELS,
  type GraphFilters,
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

    // Seed synchronously from layout so a container that is already laid out
    // (Overview/Memory tab, behind a FadeIn) reports real dimensions before
    // the first ResizeObserver callback — otherwise the graph mounts at 0x0
    // and the one-shot zoomToFit fits nothing.
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize({ width: rect.width, height: rect.height });
    }

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (box && box.width > 0 && box.height > 0) {
        setSize({ width: box.width, height: box.height });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

function GraphLegend({
  nodeCount,
  linkCount,
  personalCategoriesPresent,
  nodeKinds,
}: {
  nodeCount: number;
  linkCount: number;
  personalCategoriesPresent?: PersonalCategory[];
  nodeKinds?: ProjectGraphNodeKind[];
}) {
  const isPersonal = Boolean(personalCategoriesPresent && personalCategoriesPresent.length > 0);
  const kinds = nodeKinds ?? [];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--relay-muted)]">
      {isPersonal
        ? personalCategoriesPresent!.map((category) => (
            <span key={category} className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: PERSONAL_CATEGORY_META[category].color }}
              />
              {PERSONAL_CATEGORY_META[category].label}
            </span>
          ))
        : (Object.keys(TYPE_COLORS) as Array<keyof typeof TYPE_COLORS>).map((type) => (
            <span key={type} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[type] }} />
              {TYPE_LABELS[type]}
            </span>
          ))}
      {kinds.filter((kind) => kind !== "memory").map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: kind === "entity" ? "#14b8a6" : kind === "source" ? "#6366f1" : kind === "conversation" ? "#f97316" : "#a3e635" }} />
          {NODE_KIND_LABELS[kind]}
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
  includeEvidence,
  onIncludeEvidenceChange,
  onChange,
  onReset,
  onClose,
}: {
  settings: MemoryGraphSettings;
  includeEvidence: boolean;
  onIncludeEvidenceChange: (checked: boolean) => void;
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
          <ToggleRow label="Evidence layer" checked={includeEvidence} onChange={onIncludeEvidenceChange} />
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

function toggleSetValue<T>(set: Set<T>, value: T) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-1 text-[11px] transition-colors",
        active
          ? "border-[var(--relay-ink)] bg-[var(--relay-ink)] text-[var(--relay-bg)]"
          : "border-[var(--relay-line)] bg-[var(--relay-surface)]/80 text-[var(--relay-muted)] hover:text-[var(--relay-ink)]",
      )}
    >
      {label}
    </button>
  );
}

export function MemoryGraphContainer({
  projectId,
  projectName,
  memoryItems: _memoryItems,
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
  const [includeEvidence, setIncludeEvidence] = useState(false);
  const [nodeKindFilters, setNodeKindFilters] = useState<Set<ProjectGraphNodeKind>>(new Set());
  const [memoryTypeFilters, setMemoryTypeFilters] = useState<Set<MemoryItemType>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<PersonalCategory>>(new Set());
  const [edgeKindFilters, setEdgeKindFilters] = useState<Set<ProjectGraphEdgeKind>>(new Set());
  const compactSize = useElementSize<HTMLDivElement>();
  const fullscreenSize = useElementSize<HTMLDivElement>();
  const router = useRouter();

  // From a compact/minimap graph (overview, memory), opening "fullscreen"
  // means navigating to the dedicated graph tab. The graph tab's Exit uses
  // history.back(), so it returns to whichever tab opened it.
  function openGraphTab() {
    router.push(`/graph?project=${projectId}`);
  }

  const filters = useMemo<GraphFilters>(() => ({
    nodeKinds: nodeKindFilters,
    memoryTypes: memoryTypeFilters,
    personalCategories: categoryFilters,
    edgeKinds: edgeKindFilters,
  }), [categoryFilters, edgeKindFilters, memoryTypeFilters, nodeKindFilters]);
  const { data, loading, error } = useGraphData(activeProjectId, {
    density: expanded ? "full" : "compact",
    includeEvidence: expanded && includeEvidence,
    filters,
  });

  // Personal graph: the legend lists the present Folk categories instead of the
  // project memory types.
  const personalCategoriesPresent = Array.from(new Set(
    data.nodes
      .map((node) => personalCategoryFromMetadata(node.metadata))
      .filter((category): category is PersonalCategory => category !== null),
  ));
  const nodeKindsPresent = Array.from(new Set(data.nodes.map((node) => node.kind)));
  const availableNodes = data.snapshot?.nodes ?? [];
  const availableEdges = data.snapshot?.edges ?? [];
  const availableNodeKinds = Array.from(new Set(availableNodes.map((node) => node.kind)));
  const availableMemoryTypes = Array.from(new Set(availableNodes.flatMap((node) => node.memory ? [node.memory.type] : [])));
  const availableCategories = Array.from(new Set(
    availableNodes
      .map((node) => personalCategoryFromMetadata(node.metadata))
      .filter((category): category is PersonalCategory => category !== null),
  ));
  const availableEdgeKinds = Array.from(new Set(availableEdges.map((edge) => edge.kind)));

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
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-500">
          {error}
        </div>
      )}
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[var(--relay-bg)]/35 text-[12px] text-[var(--relay-muted)] backdrop-blur-sm">
          Loading graph...
        </div>
      )}
      {!loading && data.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <Network className="h-8 w-8 text-[var(--relay-line)]" />
          <p className="text-[12px] leading-relaxed text-[var(--relay-muted)]">
            No graph data yet. Capture a conversation or add memories to see connections appear here.
          </p>
        </div>
      )}
      {size.width > 1 && size.height > 1 ? (
        <MemoryGraph
          data={data}
          width={size.width}
          height={size.height}
          selectedNodeId={selectedNode?.id ?? null}
          settings={settings}
          onSelectNode={selectNode}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-[12px] text-[var(--relay-muted)]">
          Loading graph…
        </div>
      )}
      {settingsOpen && isFullscreen && (
        <GraphSettingsPanel
          settings={settings}
          includeEvidence={includeEvidence}
          onIncludeEvidenceChange={setIncludeEvidence}
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
                  <GraphLegend nodeCount={data.nodes.length} linkCount={data.links.length} personalCategoriesPresent={personalCategoriesPresent} nodeKinds={nodeKindsPresent} />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={openGraphTab}
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
            <GraphLegend nodeCount={data.nodes.length} linkCount={data.links.length} personalCategoriesPresent={personalCategoriesPresent} nodeKinds={nodeKindsPresent} />
            <div className="mt-2 flex max-w-[760px] flex-wrap gap-1.5">
              {availableNodeKinds.map((kind) => (
                <FilterButton key={kind} label={NODE_KIND_LABELS[kind]} active={nodeKindFilters.has(kind)} onClick={() => setNodeKindFilters((value) => toggleSetValue(value, kind))} />
              ))}
              {availableMemoryTypes.map((type) => (
                <FilterButton key={type} label={TYPE_LABELS[type]} active={memoryTypeFilters.has(type)} onClick={() => setMemoryTypeFilters((value) => toggleSetValue(value, type))} />
              ))}
              {availableCategories.map((category) => (
                <FilterButton key={category} label={PERSONAL_CATEGORY_META[category].label} active={categoryFilters.has(category)} onClick={() => setCategoryFilters((value) => toggleSetValue(value, category))} />
              ))}
              {availableEdgeKinds.map((kind) => (
                <FilterButton key={kind} label={kind.replace(/_/g, " ")} active={edgeKindFilters.has(kind)} onClick={() => setEdgeKindFilters((value) => toggleSetValue(value, kind))} />
              ))}
            </div>
          </div>
          <div className="h-full">
            {renderGraphBody("fullscreen")}
          </div>
        </div>
      )}
    </>
  );
}
