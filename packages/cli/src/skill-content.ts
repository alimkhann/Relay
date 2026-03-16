export const SKILL_FILE_NAME = "relay-context.md"

export const SKILL_CONTENT = `## Relay Context Sync

This project uses Relay for cross-AI memory sync. MCP tools are available.

### At conversation start
- Call \`relay_get_brief\` to load current project context, decisions, constraints, and tasks
- Use \`include: ["state", "memory"]\` for raw structured data alongside the brief

### During the session
- When making important decisions: \`relay_add_memory\` with type "decision" and relevant tags
- When discovering constraints: \`relay_add_memory\` with type "constraint"
- When completing tasks: \`relay_add_memory\` with type "note"
- Tag memory items with relevant keywords for easier search (e.g., tags: ["auth", "security"])

### Context management
- Use \`relay_search_context\` to check if similar decisions/constraints already exist before adding duplicates
- Use \`relay_manage_memory\` to update, archive, or delete outdated items
- Keep context lean — archive stale items rather than accumulating

### Before ending a session
- Call \`relay_save_context\` with summary, decisions, progress, next steps, and constraints
- This creates all items atomically in a single operation
`
