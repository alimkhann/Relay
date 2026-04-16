## Relay Context Sync

This project uses Relay for cross-AI memory sync. MCP tools are available.

### At conversation start
- Call `get_brief` to load current project context and decisions

### During the session (IMPORTANT — do this continuously, not just at the end)
- When making important decisions: `add_memory` with type "decision"
- When discovering constraints: `add_memory` with type "constraint"
- When completing tasks: `add_memory` with type "note"
- When defining requirements: `add_memory` with type "requirement"
- After major implementation milestones: `checkpoint_context` to snapshot progress mid-session

### Context management
- Use `search_context` to check if similar decisions/constraints already exist
- Use `manage_memory` with action "update" to correct outdated items
- Use `manage_memory` with action "delete" to remove contradicted or resolved items
- Use `manage_memory` with action "archive" to retire no-longer-relevant items
- Keep context lean — remove stale items rather than accumulating

### Before ending a session
- Call `save_context` with summary, decisions, progress, next steps
