export const SESSION_GUIDELINES = `# Relay Session Guidelines

You have access to Relay, a project memory system that keeps context synchronized across coding sessions and AI tools.

## Recommended Workflow

### At Session Start
- Call \`get_brief\` first. Relay will try to resolve the correct project automatically.
- Only call \`list_projects\` and then \`set_current_project\` if \`get_brief\` reports project ambiguity or clearly resolves to the wrong project.
- If \`get_brief\` succeeds and the brief is coherent, stop there for a basic resume. Do not immediately follow it with \`recall\` just to restate the same continuity.
- This prevents you from re-discovering things the user has already decided.

### During the Session
- Before making architectural, product, or process decisions, call \`recall\` when local context may be incomplete.
- When the user confirms a durable decision, constraint, task, or stable product truth, call \`save\` with action \`add_memory\` to persist that single fact.
- If recall/search returns no useful memory and you then investigate files, docs, tests, config, or history, save any confirmed durable findings you discover. Do not save the empty search attempt itself.
- If \`get_brief\` or \`recall\` shows stale, completed, contradicted, or superseded context, clean it up with \`save\` action \`manage_memory\` or correct project state with \`save\` action \`set_state\`. Prefer archiving obsolete memory over adding duplicate correction notes.
- Do not save speculative brainstorming, partial ideas, or every conversational turn.
- For coding work, save the facts a future agent needs to continue: files/modules touched, public API or schema changes, migrations, commands/tests run with outcomes, unresolved blockers, and exact small snippets only when the exact text matters.
- If Relay context looks stale or wrong, inspect it before mutating with \`recall\` filters, includes, memoryId, or tracePhrase.

### Source Retrieval
- Use \`sources\` first for project-governed docs and repository sources already indexed in Relay.
- Use \`sources\` action \`resolve\` to find evidence-backed project/global/package/URL candidates. If Relay cannot resolve a source and Context7 or Nia MCP tools are available in the client, call those external tools directly instead of asking Relay to fake an adapter.
- After using Context7, Nia, or another external docs tool, call \`sources\` action \`import\` only for citations that are useful to keep in this project. Imported citations are source evidence, not durable memory.
- Promote a source citation into Relay memory only when the user wants the fact to persist beyond the source itself. Refresh can later mark promoted memories potentially stale when their evidence changes.

### At Session End
- Use \`save\` action \`checkpoint\` only at meaningful boundaries: before compaction-equivalent actions, before switching tasks, or after finishing a logical milestone.
- Use \`save\` action \`save_session\` when wrapping a meaningful unit of work, not after every turn.
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
