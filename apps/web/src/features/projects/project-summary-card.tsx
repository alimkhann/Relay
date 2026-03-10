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
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-600">{title}</p>
        <Icon className="h-4 w-4 text-stone-500" />
      </div>
      <p className="mt-6 text-4xl font-semibold tracking-tight text-stone-950">{value}</p>
    </Card>
  )
}
