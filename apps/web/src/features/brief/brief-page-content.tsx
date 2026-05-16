"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDashboardDto } from "@relay/shared";
import { FileDown, RefreshCw, Copy, CheckCheck, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/fade-in";
import { EmptyState } from "@/components/ui/empty-state";
import { Markdown } from "@/components/markdown";
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

function parseErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  if ("error" in payload && typeof payload.error === "string") return payload.error;
  if ("reason" in payload && typeof payload.reason === "string") return payload.reason;
  return fallback;
}

export function BriefPageContent({
  project,
  dashboard,
}: BriefPageContentProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [editingPacketId, setEditingPacketId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [deletePacket, setDeletePacket] = useState<ProjectDashboardDto["packets"][number] | null>(null);

  function beginEdit(packet: ProjectDashboardDto["packets"][number]) {
    setEditingPacketId(packet.id);
    setEditingContent(packet.content);
  }

  function cancelEdit() {
    setEditingPacketId(null);
    setEditingContent("");
  }

  function saveEditedBrief() {
    if (!editingPacketId || !editingContent.trim()) return;

    startTransition(() => {
      void (async () => {
        setStatus("Saving brief…");
        try {
          const response = await relayClientFetch(`/api/projects/${project.id}/bootstrap`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              packetId: editingPacketId,
              content: editingContent,
            }),
          });

          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as unknown;
            throw new Error(parseErrorMessage(payload, "Failed to save brief."));
          }

          cancelEdit();
          setStatus("Brief updated.");
          router.refresh();
        } catch (cause) {
          setStatus(cause instanceof Error ? cause.message : "Request failed.");
        }
      })();
    });
  }

  function deleteBrief(packetId: string) {
    startTransition(() => {
      void (async () => {
        setStatus("Deleting brief…");
        try {
          const response = await relayClientFetch(
            `/api/projects/${project.id}/bootstrap?packetId=${encodeURIComponent(packetId)}`,
            { method: "DELETE" },
          );

          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as unknown;
            throw new Error(parseErrorMessage(payload, "Failed to delete brief."));
          }

          if (editingPacketId === packetId) {
            cancelEdit();
          }

          setStatus("Brief deleted.");
          router.refresh();
        } catch (cause) {
          setStatus(cause instanceof Error ? cause.message : "Request failed.");
        }
      })();
    });
  }

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
          if (!res.ok) {
            const payload = (await res.json().catch(() => ({}))) as unknown;
            throw new Error(parseErrorMessage(payload, "Regeneration failed."));
          }
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
            <FadeIn key={packet.id} delay={0.05 * (index + 1)}>
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
                    {editingPacketId === packet.id ? (
                      <>
                        <Button
                          size="sm"
                          disabled={pending || !editingContent.trim()}
                          onClick={saveEditedBrief}
                          className="h-6 text-[11px] px-2"
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={cancelEdit}
                          className="h-6 text-[11px] px-2"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <CopyButton text={packet.content} />
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => beginEdit(packet)}
                          className="h-6 text-[11px] px-2 gap-1"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => setDeletePacket(packet)}
                          className="h-6 text-[11px] px-2 gap-1 text-[var(--relay-faint)] hover:text-[var(--relay-danger)]"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="max-h-[520px] overflow-y-auto px-4 py-4">
                  {editingPacketId === packet.id ? (
                    <textarea
                      className="w-full min-h-[220px] rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--relay-ink-secondary)] outline-none focus:border-[var(--relay-accent)] resize-y"
                      value={editingContent}
                      onChange={(event) => setEditingContent(event.target.value)}
                      autoFocus
                    />
                  ) : (
                    <Markdown
                      content={packet.content}
                      className="text-xs leading-relaxed text-[var(--relay-ink-secondary)]"
                    />
                  )}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      )}

      <Dialog.Root open={Boolean(deletePacket)} onOpenChange={(open) => !open && setDeletePacket(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6 shadow-[var(--relay-shadow-lg)]">
            <Dialog.Title className="text-[15px] font-semibold text-[var(--relay-ink)]">
              Delete brief?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[13px] leading-relaxed text-[var(--relay-muted)]">
              Remove this cached brief for {deletePacket ? `${targetLabel(deletePacket.targetProfileKey)} (${kindLabel(deletePacket.kind)})` : "the selected target"}. You can always regenerate it.
            </Dialog.Description>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeletePacket(null)}
                className="h-8 text-[12px]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending || !deletePacket}
                onClick={() => {
                  const packetId = deletePacket?.id;
                  setDeletePacket(null);
                  if (packetId) {
                    deleteBrief(packetId);
                  }
                }}
                className="h-8 text-[12px] bg-red-600 text-white hover:bg-red-700"
              >
                Delete brief
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[12px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow-lg)]">
          {status}
        </div>
      )}
    </div>
  );
}
