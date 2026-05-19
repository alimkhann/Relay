import type { SourceSurface } from "@relay/shared";

import { cn } from "@/lib/cn";

/* ─── Surface metadata ─── */

interface SurfaceMeta {
  label: string;
  /** Tailwind classes for the chip background + text */
  classes: string;
}

const surfaceMap: Record<SourceSurface, SurfaceMeta> = {
  chatgpt: {
    label: "ChatGPT",
    classes: "bg-emerald-500/10 text-emerald-600",
  },
  claude: {
    label: "Claude",
    classes: "bg-orange-500/10 text-orange-600",
  },
  gemini: {
    label: "Gemini",
    classes: "bg-blue-500/10 text-blue-600",
  },
  grok: {
    label: "Grok",
    classes: "bg-neutral-500/10 text-neutral-600",
  },
  perplexity: {
    label: "Perplexity",
    classes: "bg-cyan-500/10 text-cyan-600",
  },
  deepseek: {
    label: "DeepSeek",
    classes: "bg-indigo-500/10 text-indigo-600",
  },
  codex: {
    label: "Codex",
    classes: "bg-violet-500/10 text-violet-600",
  },
  mcp: {
    label: "MCP",
    classes: "bg-fuchsia-500/10 text-fuchsia-600",
  },
  web: {
    label: "Web",
    classes: "bg-sky-500/10 text-sky-600",
  },
  api: {
    label: "API",
    classes: "bg-amber-500/10 text-amber-600",
  },
  ask_relay: {
    label: "Ask Relay",
    classes: "bg-sky-500/10 text-sky-600",
  },
  extension: {
    label: "Extension",
    classes: "bg-teal-500/10 text-teal-600",
  },
};

/* ─── Relative time helper ─── */

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/* ─── Component ─── */

interface ProvenanceChipProps {
  sourceSurface: SourceSurface | null;
  sourceUrl?: string | null;
  capturedAt?: string | null;
  className?: string;
  /** Compact mode hides the timestamp */
  compact?: boolean;
}

export function ProvenanceChip({
  sourceSurface,
  sourceUrl,
  capturedAt,
  className,
  compact = false,
}: ProvenanceChipProps) {
  if (!sourceSurface) return null;

  const meta = surfaceMap[sourceSurface];
  if (!meta) return null;

  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
        meta.classes,
        sourceUrl && "cursor-pointer hover:opacity-80 transition-opacity",
        className,
      )}
    >
      {meta.label}
      {!compact && capturedAt && (
        <span className="opacity-60">{relativeTime(capturedAt)}</span>
      )}
    </span>
  );

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex"
      >
        {chip}
      </a>
    );
  }

  return chip;
}
