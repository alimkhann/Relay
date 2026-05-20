import {
  Activity,
  BookmarkPlus,
  BrainCircuit,
  ClipboardEdit,
  ClipboardList,
  FileText,
  FolderSearch,
  FolderTree,
  GitBranch,
  Globe,
  Library,
  MessageSquare,
  RefreshCw,
  Regex,
  Save,
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
  relay_knowledge: Library,
  recall_past_chats: MessageSquare,
  list_sources: FolderTree,
  search_sources: Search,
  read_source: FileText,
  explore_sources: FolderSearch,
  grep_sources: Regex,
  import_source_citation: BookmarkPlus,
  refresh_source: RefreshCw,
  get_project_state: ClipboardList,
  set_project_state: ClipboardEdit,
  trace_context: GitBranch,
  save_context: Save,
  // Synthetic tool emitted when Gemini grounding returned web sources.
  web_search: Globe
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
    relay_knowledge: "Checking Relay docs",
    recall_past_chats: "Recalling past chats",
    list_sources: "Listing sources",
    search_sources: "Searching sources",
    read_source: "Reading source",
    explore_sources: "Exploring sources",
    grep_sources: "Grepping sources",
    import_source_citation: "Promoting citation",
    refresh_source: "Refreshing source",
    get_project_state: "Reading project state",
    set_project_state: "Updating project state",
    trace_context: "Tracing context",
    save_context: "Saving checkpoint",
    web_search: "Searching the web"
  }
  return verbs[tool] ?? `Running ${tool.replace(/_/g, " ")}`
}
