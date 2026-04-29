export const SESSION_GUIDELINES = `# Relay Session Guidelines

You have access to Relay, a project memory system that keeps context synchronized across coding sessions and AI tools.

## Recommended Workflow

### At Session Start
- Call \`get_brief\` first. Relay will try to resolve the correct project automatically.
- Only call \`list_projects\` and then \`set_current_project\` if \`get_brief\` reports project ambiguity or clearly resolves to the wrong project.
- If \`get_brief\` succeeds and the brief is coherent, stop there for a basic resume. Do not immediately follow it with \`get_project_state\`, \`list_sessions\`, \`list_briefs\`, or \`search_context\`.
- This prevents you from re-discovering things the user has already decided.

### During the Session
- Before making architectural, product, or process decisions, call \`search_context\` or \`recall_context\` when local context may be incomplete.
- When the user confirms a durable decision, constraint, task, or stable product truth, call \`add_memory\` to persist that single fact.
- Do not save speculative brainstorming, partial ideas, or every conversational turn.
- For coding work, save the facts a future agent needs to continue: files/modules touched, public API or schema changes, migrations, commands/tests run with outcomes, unresolved blockers, and exact small snippets only when the exact text matters.
- If Relay context looks stale or wrong, inspect it before mutating:
  use \`list_memory\`, \`list_sessions\`, \`list_briefs\`, \`trace_context_sources\`, and \`list_recent_activity\`.

### At Session End
- Use \`checkpoint_context\` only at meaningful boundaries: before compaction-equivalent actions, before switching tasks, or after finishing a logical milestone.
- Use \`save_context\` when wrapping a meaningful unit of work, not after every turn.
- This keeps Relay current without turning it into a noisy per-turn write path.

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
