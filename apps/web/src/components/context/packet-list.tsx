import type { BootstrapPacketDto, ContextPacketDto } from "@relay/shared";

export function PacketList({
  packets,
}: {
  packets: Array<ContextPacketDto | BootstrapPacketDto>;
}) {
  if (packets.length === 0) {
    return (
      <p className="text-sm text-[var(--relay-muted)]">
        No project brief yet. Relay will prepare one after the next chat.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {packets.map((packet) => (
        <div
          key={packet.id}
          className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-4 shadow-[var(--relay-shadow-sm)]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-[var(--relay-faint)]">
              Project brief
            </span>
            {"kind" in packet ? (
              <span className="text-[11px] text-[var(--relay-faint)]">
                {packet.kind === "fresh_chat_bootstrap"
                  ? "Fresh chat"
                  : "Continuation"}
              </span>
            ) : null}
          </div>
          <pre className="mt-3 whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-[var(--relay-ink-secondary)]">
            {packet.content}
          </pre>
        </div>
      ))}
    </div>
  );
}
