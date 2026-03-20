## Relay Context Sync

This project uses Relay for cross-AI memory sync. MCP tools are available.

### At conversation start
- Call `get_brief` to load current project context and decisions

### During the session
- When making important decisions: `add_memory` with type "decision"
- When discovering constraints: `add_memory` with type "constraint"
- When completing tasks: `add_memory` with type "note"

### Context management
- Use `search_context` to check if similar decisions/constraints already exist
- Use `relay_update_memory` to correct outdated items
- Use `relay_delete_memory` to remove contradicted or resolved items
- Keep context lean — remove stale items rather than accumulating

### Before ending a session
- Call `save_context` with summary, decisions, progress, next steps
