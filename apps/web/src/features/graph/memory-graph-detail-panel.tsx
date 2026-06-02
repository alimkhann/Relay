"use client";

import { ExternalLink, FileText, Pin, X } from "lucide-react";

import { PERSONAL_CATEGORY_META, personalCategoryFromMetadata } from "@relay/shared";

import {
  formatMemoryDate,
  graphEndpointId,
  nodeColor,
  RELATION_COLORS,
  TYPE_LABELS,
  type GraphLink,
  type GraphNode,
} from "./memory-graph-utils";

interface MemoryGraphDetailPanelProps {
  node: GraphNode | null;
  links: GraphLink[];
  allNodes: GraphNode[];
  onClose: () => void;
  onSelectNode: (node: GraphNode) => void;
}

export function MemoryGraphDetailPanel({
  node,
  links,
  allNodes,
  onClose,
  onSelectNode,
}: MemoryGraphDetailPanelProps) {
  if (!node) return null;

  const relatedLinks = links.filter((link) => {
    return graphEndpointId(link.source) === node.id || graphEndpointId(link.target) === node.id;
  });
  const nodesById = new Map(allNodes.map((item) => [item.id, item]));
  const sourceFile = node.kind === "source-file" ? node.source : undefined;
  const isSourceFile = Boolean(sourceFile);
  const personalCategory = personalCategoryFromMetadata(node.metadata);
  const typeLabel = personalCategory
    ? PERSONAL_CATEGORY_META[personalCategory].label
    : TYPE_LABELS[node.type];

  return (
    <aside className="absolute right-3 top-3 bottom-3 z-20 flex w-[min(360px,calc(100%-24px))] flex-col overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]/92 shadow-[var(--relay-shadow-lg)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--relay-line)] px-4 py-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--relay-muted)]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: nodeColor(node) }}
            />
            {isSourceFile ? "Source file" : typeLabel}
            {node.pinned && <Pin className="h-3 w-3 fill-current" />}
          </div>
          <h2 className="truncate text-sm font-semibold text-[var(--relay-ink)]">
            {node.title ?? node.label}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
          aria-label="Close memory details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          {isSourceFile ? (
            <div className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--relay-muted)]">Status</p>
              <p className="mt-1 font-medium capitalize text-[var(--relay-ink)]">{sourceFile?.status}</p>
            </div>
          ) : (
            <div className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--relay-muted)]">Decay</p>
              <p className="mt-1 font-medium text-[var(--relay-ink)]">{Math.round(node.decayScore * 100)}%</p>
            </div>
          )}
          <div className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-[var(--relay-muted)]">{isSourceFile ? "Chunks" : "Captured"}</p>
            <p className="mt-1 font-medium text-[var(--relay-ink)]">
              {isSourceFile ? sourceFile?.chunkCount.toLocaleString("en-US") : formatMemoryDate(node.capturedAt)}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[var(--relay-muted)]">
            {isSourceFile && <FileText className="h-3.5 w-3.5" />}
            {isSourceFile ? "Preview" : "Content"}
          </p>
          <p className={isSourceFile
            ? "max-h-64 overflow-auto whitespace-pre-wrap rounded-[18px] border border-[var(--relay-line)] bg-[var(--relay-soft)] px-3 py-3 text-[12px] leading-relaxed text-[var(--relay-ink-secondary)]"
            : "whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--relay-ink-secondary)]"
          }>
            {node.content}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--relay-muted)]">
          {isSourceFile && (
            <>
              <span className="rounded-full border border-[var(--relay-line)] px-2 py-1">
                {(((sourceFile?.byteSize ?? 0) / 1024)).toFixed(1)} KB
              </span>
              <span className="rounded-full border border-[var(--relay-line)] px-2 py-1">
                {(sourceFile?.tokenEstimate ?? 0).toLocaleString("en-US")} tokens
              </span>
              {sourceFile?.mimeType && (
                <span className="rounded-full border border-[var(--relay-line)] px-2 py-1">
                  {sourceFile.mimeType}
                </span>
              )}
            </>
          )}
          {node.sourceSurface && (
            <span className="rounded-full border border-[var(--relay-line)] px-2 py-1">
              {node.sourceSurface}
            </span>
          )}
          <span className="rounded-full border border-[var(--relay-line)] px-2 py-1">
            Updated {formatMemoryDate(node.updatedAt)}
          </span>
          {node.sourceUrl && (
            <a
              href={node.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--relay-line)] px-2 py-1 transition-colors hover:text-[var(--relay-ink)]"
            >
              Source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-medium text-[var(--relay-muted)]">
            Relations ({relatedLinks.length})
          </p>
          {relatedLinks.length > 0 ? (
            <div className="space-y-2">
              {relatedLinks.map((link, index) => {
                const sourceId = graphEndpointId(link.source);
                const targetId = graphEndpointId(link.target);
                const relatedId = sourceId === node.id ? targetId : sourceId;
                const relatedNode = nodesById.get(relatedId);
                if (!relatedNode) return null;

                return (
                  <button
                    key={`${sourceId}-${targetId}-${link.relationType}-${index}`}
                    type="button"
                    onClick={() => onSelectNode(relatedNode)}
                    className="w-full rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-3 py-2 text-left transition-colors hover:bg-[var(--relay-soft)]"
                  >
                    <span
                      className="text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: RELATION_COLORS[link.relationType] }}
                    >
                      {link.relationType} · {Math.round(link.confidence * 100)}%
                    </span>
                    <span className="mt-1 block truncate text-[12px] text-[var(--relay-ink)]">
                      {relatedNode.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-[var(--relay-radius-sm)] border border-dashed border-[var(--relay-line)] px-3 py-3 text-[12px] text-[var(--relay-muted)]">
              No explicit relations yet. Relay will connect this item as more memory accumulates.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
