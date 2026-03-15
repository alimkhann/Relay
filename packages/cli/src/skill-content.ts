export const SKILL_FILE_NAME = "relay-context.md"

export const SKILL_CONTENT = `## Relay Context Sync

This project uses Relay for cross-AI memory sync. MCP tools are available.

### At conversation start
- Call \`relay_get_brief\` to load current project context and decisions

### During the session
- When making important decisions: \`relay_add_memory\` with type "decision"
- When discovering constraints: \`relay_add_memory\` with type "constraint"
- When completing tasks: \`relay_add_memory\` with type "note"

### Context management
- Use \`relay_search_context\` to check if similar decisions/constraints already exist
- Use \`relay_update_memory\` to correct outdated items
- Use \`relay_delete_memory\` to remove contradicted or resolved items
- Keep context lean — remove stale items rather than accumulating

### Before ending a session
- Call \`relay_save_context\` with summary, decisions, progress, next steps
`
