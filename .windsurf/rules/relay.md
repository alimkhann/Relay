# Relay Windsurf Guidance

The canonical repository policy is in `AGENTS.md`. Follow it first.

- Start or resume with `get_brief`. Only call `list_projects` and `set_current_project` if Relay reports project ambiguity or the wrong project.
- Use `search_context` or `recall_context` before making architecture, product, or workflow decisions that might conflict with prior context.
- Use `add_memory` only for clearly confirmed durable facts. Use `checkpoint_context` before compaction risk, task switches, or milestone saves, and `save_context` only when ending a meaningful unit of work.
- Relay does not install noisy per-tool Windsurf autosave hooks by default. Keep saves deliberate and boundary-oriented.
