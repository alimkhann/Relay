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

- Start or resume with `get_brief`. Only call `list_projects` and `set_current_project` if Relay reports project ambiguity or the wrong project.
- Before architecture, product, or process decisions, prefer `search_context` or `recall_context` when local context may be incomplete.
- Use `get_project_state` when you need the structured objective, constraints, or open tasks instead of a prose brief.
- Use `add_memory` only for clearly confirmed durable facts: decisions, constraints, tasks, and stable product truths. Do not save speculative brainstorming until it is confirmed.
- Use `checkpoint_context` only before compaction-equivalent risk, task switches, or explicit milestone saves. Use `save_context` only when wrapping up a meaningful unit of work.
- Use `checkpoint_context` only at meaningful milestones, before switching tasks, or before compaction-equivalent actions.
- Avoid repeated Relay reads or writes when the current local conversation already contains the needed context.
<!-- END RELAY MANAGED BLOCK: copilot -->
