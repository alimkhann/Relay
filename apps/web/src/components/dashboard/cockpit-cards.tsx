import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Database,
  FileStack,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import type {
  BootstrapPacketDto,
  CanonEntryDto,
  MemoryItemDto,
  ProjectAiBudgetDto,
} from "@relay/shared"

import { cn } from "@/lib/cn"

type Kind = CanonEntryDto["kind"]

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "never"
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return "just now"
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

function CockpitCard({
  title,
  eyebrow,
  icon: Icon,
  action,
  tone = "default",
  children,
  className,
}: {
  title: string
  eyebrow?: string
  icon?: React.ElementType
  action?: React.ReactNode
  tone?: "default" | "warning" | "alert"
  children: React.ReactNode
  className?: string
}) {
  const toneRing = {
    default: "border-[var(--relay-line)]",
    warning: "border-amber-300/60 dark:border-amber-500/40",
    alert: "border-red-300/60 dark:border-red-500/40",
  }[tone]

  return (
    <section
      className={cn(
        "rounded-[var(--relay-radius)] border bg-[var(--relay-surface)] p-4 flex flex-col gap-3 min-h-[160px]",
        toneRing,
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--relay-faint)]">
              {eyebrow}
            </p>
          ) : null}
          <h3 className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--relay-ink)]">
            {Icon ? <Icon className="h-3.5 w-3.5 text-[var(--relay-muted)]" /> : null}
            {title}
          </h3>
        </div>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  )
}

export function StatusChip({
  status,
}: {
  status: CanonEntryDto["status"]
}) {
  const map: Record<CanonEntryDto["status"], { label: string; cls: string }> = {
    active: { label: "active", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    tentative: { label: "tentative", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    disputed: { label: "disputed", cls: "bg-red-500/10 text-red-600 dark:text-red-400" },
    superseded: { label: "superseded", cls: "bg-[var(--relay-soft)] text-[var(--relay-muted)]" },
    stale: { label: "stale", cls: "bg-[var(--relay-soft)] text-[var(--relay-muted)]" },
    resolved: { label: "resolved", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  }
  const it = map[status]
  return (
    <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium", it.cls)}>
      {it.label}
    </span>
  )
}

const kindOrder: Kind[] = [
  "objective",
  "decision",
  "constraint",
  "task",
  "progress",
  "architecture_fact",
  "risk",
  "assumption",
  "question",
  "artifact",
]

function firstEntryOfKind(canon: CanonEntryDto[], kind: Kind): CanonEntryDto | undefined {
  return canon.find((entry) => entry.kind === kind && entry.status === "active")
}

function entriesOfKind(canon: CanonEntryDto[], kind: Kind, max = 3): CanonEntryDto[] {
  return canon.filter((entry) => entry.kind === kind && entry.status === "active").slice(0, max)
}

// --------------------------------------------------------------------------
// 1. Current Canon
// --------------------------------------------------------------------------

export function CurrentCanonCard({
  projectId,
  canon,
}: {
  projectId: string
  canon: CanonEntryDto[]
}) {
  const objective = firstEntryOfKind(canon, "objective")
  const decisions = entriesOfKind(canon, "decision", 3)
  const constraints = entriesOfKind(canon, "constraint", 2)
  const tasks = entriesOfKind(canon, "task", 3)
  const progress = firstEntryOfKind(canon, "progress")

  const isEmpty = !objective && decisions.length === 0 && constraints.length === 0 && tasks.length === 0 && !progress

  return (
    <CockpitCard
      eyebrow="Current canon"
      title="What is true now"
      icon={ShieldCheck}
      action={
        <Link
          href={`/projects/${projectId}?tab=canon`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
        >
          Open canon
          <ArrowRight className="h-3 w-3" />
        </Link>
      }
      className="lg:col-span-2"
    >
      {isEmpty ? (
        <p className="text-[12px] leading-relaxed text-[var(--relay-muted)]">
          No canon yet. Relay will propose canon as it observes chats, and you can lock what matters.
        </p>
      ) : (
        <div className="space-y-3">
          {objective ? (
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--relay-faint)]">Objective</p>
              <p className="mt-0.5 text-[13px] leading-snug text-[var(--relay-ink)] line-clamp-2">
                {objective.title ?? objective.content}
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {decisions.length > 0 ? (
              <CanonBlock label="Active decisions" entries={decisions} />
            ) : null}
            {constraints.length > 0 ? (
              <CanonBlock label="Constraints" entries={constraints} />
            ) : null}
            {tasks.length > 0 ? (
              <CanonBlock label="Open tasks" entries={tasks} />
            ) : null}
            {progress ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--relay-faint)]">Recent progress</p>
                <p className="mt-0.5 text-[12px] leading-snug text-[var(--relay-muted)] line-clamp-3">
                  {progress.content}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </CockpitCard>
  )
}

function CanonBlock({ label, entries }: { label: string; entries: CanonEntryDto[] }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--relay-faint)]">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-start gap-1.5 text-[12px] leading-snug text-[var(--relay-ink-secondary)]">
            {entry.lockedByUser ? (
              <Lock className="mt-0.5 h-3 w-3 shrink-0 text-[var(--relay-muted)]" />
            ) : (
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--relay-muted)]/50" />
            )}
            <span className="line-clamp-1">{entry.title ?? entry.content}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// --------------------------------------------------------------------------
// 2. Tentative Updates
// --------------------------------------------------------------------------

export function TentativeUpdatesCard({
  projectId,
  canon,
}: {
  projectId: string
  canon: CanonEntryDto[]
}) {
  const tentative = canon.filter((entry) => entry.status === "tentative").slice(0, 4)

  return (
    <CockpitCard
      eyebrow="Awaiting review"
      title="Tentative updates"
      icon={Sparkles}
      tone={tentative.length > 0 ? "warning" : "default"}
      action={
        tentative.length > 0 ? (
          <Link
            href={`/projects/${projectId}?tab=canon&status=tentative`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
          >
            Review
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null
      }
    >
      {tentative.length === 0 ? (
        <p className="text-[12px] text-[var(--relay-muted)]">No tentative updates. Relay will surface proposals here before they become canon.</p>
      ) : (
        <ul className="space-y-1.5">
          {tentative.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2 text-[12px] leading-snug">
              <StatusChip status="tentative" />
              <span className="line-clamp-2 text-[var(--relay-ink-secondary)]">
                <span className="text-[var(--relay-faint)] mr-1">{kindLabel(entry.kind)}:</span>
                {entry.title ?? entry.content}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CockpitCard>
  )
}

// --------------------------------------------------------------------------
// 3. Conflicts
// --------------------------------------------------------------------------

export function ConflictsCard({
  projectId,
  canon,
}: {
  projectId: string
  canon: CanonEntryDto[]
}) {
  const disputed = canon.filter((entry) => entry.status === "disputed")
  const stale = canon.filter((entry) => entry.status === "stale")
  const lockedDisputes = disputed.filter((entry) => entry.lockedByUser)
  const total = disputed.length + stale.length

  return (
    <CockpitCard
      eyebrow="Needs attention"
      title="Conflicts"
      icon={AlertTriangle}
      tone={disputed.length > 0 ? "alert" : stale.length > 0 ? "warning" : "default"}
      action={
        total > 0 ? (
          <Link
            href={`/projects/${projectId}?tab=canon&status=disputed`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
          >
            Resolve
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null
      }
    >
      {total === 0 ? (
        <p className="text-[12px] text-[var(--relay-muted)]">No conflicts. Locked and active canon agree with recent evidence.</p>
      ) : (
        <div className="space-y-1.5 text-[12px]">
          {disputed.length > 0 ? (
            <p className="text-[var(--relay-ink-secondary)]">
              <span className="font-semibold text-red-600 dark:text-red-400">{disputed.length}</span> disputed
              {lockedDisputes.length > 0 ? (
                <>
                  {" · "}
                  <span className="font-semibold">{lockedDisputes.length}</span> locked-conflict
                </>
              ) : null}
            </p>
          ) : null}
          {stale.length > 0 ? (
            <p className="text-[var(--relay-ink-secondary)]">
              <span className="font-semibold text-amber-600 dark:text-amber-400">{stale.length}</span> stale · review recommended
            </p>
          ) : null}
          <ul className="mt-1 space-y-1 text-[11px] text-[var(--relay-muted)]">
            {[...disputed, ...stale].slice(0, 3).map((entry) => (
              <li key={entry.id} className="flex items-start gap-1.5">
                <StatusChip status={entry.status} />
                <span className="line-clamp-1">{entry.title ?? entry.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CockpitCard>
  )
}

// --------------------------------------------------------------------------
// 4. Context Packets
// --------------------------------------------------------------------------

export function ContextPacketsCard({
  projectId,
  packets,
}: {
  projectId: string
  packets: BootstrapPacketDto[]
}) {
  const browser = packets.find((p) => p.kind === "fresh_chat_bootstrap")
  const agent = packets.find((p) => p.kind === "quick_continuity")

  return (
    <CockpitCard
      eyebrow="Latest output"
      title="Context packets"
      icon={FileStack}
      action={
        <Link
          href={`/projects/${projectId}?tab=packets`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
        >
          All packets
          <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-2 text-[12px]">
        <PacketRow
          icon={MessageSquare}
          label="Browser chat"
          modeHint="chat_new · chat_continue"
          packet={browser}
        />
        <PacketRow
          icon={Bot}
          label="Coding agent"
          modeHint="agent_quick · agent_full"
          packet={agent}
        />
      </div>
    </CockpitCard>
  )
}

function PacketRow({
  icon: Icon,
  label,
  modeHint,
  packet,
}: {
  icon: React.ElementType
  label: string
  modeHint: string
  packet: BootstrapPacketDto | undefined
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-2.5 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--relay-muted)]" />
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[var(--relay-ink)]">{label}</p>
          <p className="text-[10px] text-[var(--relay-faint)] truncate">{modeHint}</p>
        </div>
      </div>
      <p className="text-[11px] tabular-nums text-[var(--relay-muted)] shrink-0">
        {packet ? formatAgo(packet.createdAt) : "none"}
      </p>
    </div>
  )
}

// --------------------------------------------------------------------------
// 5. Memory Health
// --------------------------------------------------------------------------

export function MemoryHealthCard({
  projectId,
  memory,
  aiBudget,
}: {
  projectId: string
  memory: MemoryItemDto[]
  aiBudget?: ProjectAiBudgetDto
}) {
  const counts = memory.reduce(
    (acc, item) => {
      const state = (item.metadata?.compactionState as string | undefined) ?? "active"
      if (state === "covered_by_canon" || state === "covered_by_summary") acc.demoted += 1
      else if (state === "historical_only" || state === "completed") acc.archived += 1
      else acc.active += 1
      return acc
    },
    { active: 0, demoted: 0, archived: 0 },
  )

  const dailyLimit = aiBudget?.dailyProjectAiLimit || 0
  const dailyUsed = aiBudget?.dailyProjectAiUsed || 0
  const pct = dailyLimit > 0 ? Math.min(100, Math.round((dailyUsed / dailyLimit) * 100)) : 0

  return (
    <CockpitCard
      eyebrow="Health"
      title="Memory & budget"
      icon={Database}
      action={
        <Link
          href={`/projects/${projectId}?tab=memory`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--relay-muted)] hover:text-[var(--relay-ink)]"
        >
          Open memory
          <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <CountTile label="active" value={counts.active} />
        <CountTile label="demoted" value={counts.demoted} muted />
        <CountTile label="archived" value={counts.archived} muted />
      </div>
      {dailyLimit > 0 ? (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-[var(--relay-muted)]">
            <span>AI budget today</span>
            <span className="tabular-nums">
              {dailyUsed}/{dailyLimit}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--relay-soft)]">
            <div
              className={cn(
                "h-full transition-all",
                pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}
    </CockpitCard>
  )
}

function CountTile({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] py-2">
      <p
        className={cn(
          "text-xl font-semibold font-mono tabular-nums leading-none",
          muted ? "text-[var(--relay-muted)]" : "text-[var(--relay-ink)]",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--relay-faint)]">{label}</p>
    </div>
  )
}

// --------------------------------------------------------------------------
// Grid wrapper
// --------------------------------------------------------------------------

export function CockpitGrid({
  projectId,
  canon,
  packets,
  memory,
  aiBudget,
}: {
  projectId: string
  canon: CanonEntryDto[]
  packets: BootstrapPacketDto[]
  memory: MemoryItemDto[]
  aiBudget?: ProjectAiBudgetDto
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <CurrentCanonCard projectId={projectId} canon={canon} />
      <ContextPacketsCard projectId={projectId} packets={packets} />
      <TentativeUpdatesCard projectId={projectId} canon={canon} />
      <ConflictsCard projectId={projectId} canon={canon} />
      <MemoryHealthCard projectId={projectId} memory={memory} aiBudget={aiBudget} />
    </div>
  )
}

export function kindLabel(kind: Kind): string {
  const map: Record<Kind, string> = {
    objective: "Objective",
    decision: "Decision",
    constraint: "Constraint",
    task: "Task",
    progress: "Progress",
    artifact: "Artifact",
    architecture_fact: "Architecture",
    risk: "Risk",
    assumption: "Assumption",
    question: "Question",
  }
  return map[kind] ?? kind
}
