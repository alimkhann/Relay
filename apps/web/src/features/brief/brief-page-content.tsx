"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDashboardDto } from "@relay/shared";
import { FileDown, RefreshCw, Copy, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { EmptyState } from "@/components/ui/empty-state";
import { createClientFlowId } from "@/lib/telemetry/client";
import { relayClientFetch } from "@/lib/telemetry/fetch";

function targetLabel(key: string): string {
  const map: Record<string, string> = {
    chatgpt_planning: "ChatGPT",
    claude_code_build: "Claude",
    codex_implementation: "Codex",
    perplexity_research: "Perplexity",
  };
  return map[key] ?? key;
}

function kindLabel(kind: string): string {
  return kind === "fresh_chat_bootstrap" ? "Full brief" : "Continuity";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 text-[11px] px-2 gap-1"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <CheckCheck className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

interface BriefPageContentProps {
  project: { id: string; name: string };
  dashboard: ProjectDashboardDto;
}

export function BriefPageContent({
  project,
  dashboard,
}: BriefPageContentProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  function regenerateBrief(targetProfileKey: string, kind: string) {
    const flowId = createClientFlowId("brief");
    startTransition(() => {
      void (async () => {
        setStatus("Regenerating brief…");
        try {
          const res = await relayClientFetch(
            `/api/projects/${project.id}/bootstrap`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              telemetry: {
                surface: "web-dashboard",
                area: "briefs",
                event: "brief_regenerate.submit",
                flowId,
                logSuccess: true,
              },
              body: JSON.stringify({
                targetProfileKey,
                kind,
                deep: kind === "fresh_chat_bootstrap",
              }),
            },
          );
          if (!res.ok) throw new Error("Regeneration failed.");
          setStatus("Brief regenerated.");
          router.refresh();
        } catch (cause) {
          setStatus(
            cause instanceof Error ? cause.message : "Request failed.",
          );
        }
      })();
    });
  }

  const packets = dashboard.packets;

  return (
    <div className="space-y-6 pt-6">
      <FadeIn>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
              Briefs
            </h1>
            <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
              AI-ready context packets generated from your project state.
            </p>
          </div>
        </div>
      </FadeIn>

      {packets.length === 0 ? (
        <FadeIn delay={0.05}>
          <EmptyState
            title="No briefs yet"
            description="Briefs are generated after your first chat capture."
            className="py-12"
          />
        </FadeIn>
      ) : (
        <div className="space-y-3">
          {packets.map((packet, index) => (
            <FadeIn key={`${packet.targetProfileKey}-${index}`} delay={0.05 * (index + 1)}>
              <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--relay-line)]">
                  <div className="flex items-center gap-2">
                    <FileDown className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
                    <span className="text-sm font-medium text-[var(--relay-ink)]">
                      {targetLabel(packet.targetProfileKey)}
                    </span>
                    <span className="text-[10px] text-[var(--relay-faint)] rounded-full bg-[var(--relay-soft)] px-1.5 py-0.5">
                      {kindLabel(packet.kind)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CopyButton text={packet.content} />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        regenerateBrief(packet.targetProfileKey, packet.kind)
                      }
                      className="h-6 text-[11px] px-2 gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Regenerate
                    </Button>
                  </div>
                </div>
                <div className="max-h-[520px] overflow-y-auto px-4 py-4">
                  <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--relay-ink-secondary)]">
                    {packet.content}
                  </p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      )}

      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </div>
  );
}
