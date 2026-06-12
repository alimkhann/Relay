# Relay Guidance

- Start or resume with `get_brief`. Only call `list_projects` and `set_current_project` if Relay reports project ambiguity or the wrong project.
- Use `recall` before major architecture, product, or process decisions.
- Use `save` action `add_memory` only for clearly confirmed durable facts. Use `save` action `checkpoint` before compaction risk, task switches, or milestone saves, and `save` action `save_session` when you finish a meaningful unit of work.
- If Relay recall returns nothing, investigate locally and save only confirmed durable findings, not the empty recall attempt.
- If `get_brief` or `recall` shows stale, completed, contradicted, or superseded context, clean it up with `save` action `manage_memory` or `set_state`.
- Do not overuse Relay when the current conversation already contains the necessary context.
