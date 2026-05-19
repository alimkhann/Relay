import {
  Activity,
  BookmarkPlus,
  BrainCircuit,
  FileText,
  FolderTree,
  Library,
  Search,
  Sparkles,
  Wrench,
  type LucideIcon
} from "lucide-react"

/** Maps an assistant tool name to its glyph. Keep in sync with the tool set in
 *  server/services/assistant-tools.ts. */
const TOOL_ICONS: Record<string, LucideIcon> = {
  list_projects: FolderTree,
  recall_context: BrainCircuit,
  search_memory: Search,
  list_recent_activity: Activity,
  get_brief: FileText,
  add_memory: BookmarkPlus,
  manage_memory: Wrench,
  relay_knowledge: Library
}

export function toolIcon(tool: string | null | undefined): LucideIcon {
  if (!tool) return Sparkles
  return TOOL_ICONS[tool] ?? Wrench
}

/** Human label for a tool name (e.g. "recall_context" → "Recalling context"). */
export function toolLabel(tool: string): string {
  const verbs: Record<string, string> = {
    list_projects: "Listing projects",
    recall_context: "Recalling context",
    search_memory: "Searching memory",
    list_recent_activity: "Reading activity",
    get_brief: "Building brief",
    add_memory: "Saving to memory",
    manage_memory: "Updating memory",
    relay_knowledge: "Checking Relay docs"
  }
  return verbs[tool] ?? `Running ${tool.replace(/_/g, " ")}`
}
