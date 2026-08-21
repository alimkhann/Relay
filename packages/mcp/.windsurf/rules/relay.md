# Relay Windsurf Guidance

The canonical repository policy is in `AGENTS.md`. Follow it first.

- Start or resume with `get_brief`. Only call `list_projects` and `set_current_project` if Relay reports project ambiguity or the wrong project.
- Use `recall` before making architecture, product, or workflow decisions that might conflict with prior context.
- Use `save` action `add_memory` only for clearly confirmed durable facts. Use `save` action `checkpoint` before compaction risk, task switches, or milestone saves, and `save` action `save_session` only when ending a meaningful unit of work.
- If Relay recall returns nothing, investigate locally and save only confirmed durable findings, not the empty recall attempt.
- If `get_brief` or `recall` shows stale, completed, contradicted, or superseded context, clean it up with `save` action `manage_memory` or `set_state`.
- Relay does not install noisy per-tool Windsurf autosave hooks by default. Keep saves deliberate and boundary-oriented.
