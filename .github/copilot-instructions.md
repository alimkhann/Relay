# Relay Copilot Overlay

The canonical repository policy is in `AGENTS.md`. Follow it first.

Additional VS Code / Copilot guidance for this repo:

- Prefer `AGENTS.md` and this file over inventing new repo conventions.
- Keep tool use deliberate and low-noise: one targeted search pass, then read only the needed files.
- Prefer `pnpm test:stable` for routine validation. Use the full `pnpm test` only when necessary.
- Do not touch `apps/extension` unless explicitly requested.
- If you change MCP client support, update the shared compatibility registry, installer behavior, docs, and tests together.

<!-- BEGIN RELAY MANAGED BLOCK: copilot -->
## Relay for VS Code / Copilot

- When starting fresh work or resuming after a break, use Relay early: `list_projects`, `set_current_project` if needed, then `get_brief`.
- Before architecture changes or uncertain decisions, prefer `search_context` or `recall_context` over guessing.
- Use `get_project_state` when you need the structured objective, constraints, or open tasks instead of a prose brief.
- Use `add_memory` only for durable single facts. Use `checkpoint_context` for a mid-task milestone. Use `save_context` when wrapping up a meaningful unit of work.
- Use `checkpoint_context` only at meaningful milestones, before switching tasks, or before compaction-equivalent actions.
- Avoid repeated Relay reads or writes when the current local conversation already contains the needed context.
<!-- END RELAY MANAGED BLOCK: copilot -->
