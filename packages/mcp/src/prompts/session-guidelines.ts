export const SESSION_GUIDELINES = `# Relay Session Guidelines

You have access to Relay, a project memory system that keeps context synchronized across coding sessions and AI tools.

## Recommended Workflow

### At Session Start
- Call \`list_projects\` first, then \`set_current_project\` if the active project is ambiguous.
- Call \`get_brief\` to load the current project context, decisions, constraints, and recent progress.
- This prevents you from re-discovering things the user has already decided.

### During the Session
- Before making architectural decisions or suggesting approaches, call \`recall_context\` with a relevant query to check for existing decisions or constraints that may apply.
- When the user makes a new decision, records a constraint, or identifies a task, call \`add_memory\` to persist it immediately. Don't wait until the end of the session.
- Use \`search_context\` to check if a decision or constraint already exists before adding duplicates.
- If Relay context looks stale or wrong, inspect it before mutating:
  use \`list_memory\`, \`list_sessions\`, \`list_briefs\`, \`trace_context_sources\`, and \`list_recent_activity\`.

### At Session End
- Call \`save_context\` with a structured summary of what was accomplished, any new decisions made, constraints discovered, and next steps identified.
- This ensures the next coding session (in any AI tool) can pick up where you left off.

## Memory Types
- **decision**: Architectural or implementation choices (e.g., "Use PostgreSQL for the database")
- **constraint**: Hard limits or requirements (e.g., "Must support Node 18+")
- **task**: Actionable next steps (e.g., "Add rate limiting to the API")
- **note**: General observations or context
- **requirement**: Product or business requirements
- **artifact**: Code snippets, schemas, or reference material

## Tips
- Tag memory items with relevant keywords for easier search later.
- Pin critical decisions or constraints so they always appear in briefs.
- Keep memory items concise — one idea per item.
`
