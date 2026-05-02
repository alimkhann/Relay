import { FolderKanban, Layers3, MessageSquareQuote } from "lucide-react"

import { Card } from "@/components/ui/card"

export function ProjectSummaryCard({
  title,
  value,
  icon
}: {
  title: string
  value: string
  icon: "projects" | "memory" | "sessions"
}) {
  const Icon = {
    projects: FolderKanban,
    memory: Layers3,
    sessions: MessageSquareQuote
  }[icon]

  return (
    <Card className="p-0 border-none py-0">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium tracking-wide uppercase text-[var(--relay-ink)] opacity-70">{title}</p>
        <Icon className="h-4 w-4 text-[var(--relay-ink-secondary)]" />
      </div>
      <p className="mt-4 text-3xl font-medium tracking-tight text-[var(--relay-ink)]">{value}</p>
    </Card>
  )
}
