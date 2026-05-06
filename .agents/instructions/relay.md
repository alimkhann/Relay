# Relay Guidance

- Start or resume with `get_brief`. Only call `list_projects` and `set_current_project` if Relay reports project ambiguity or the wrong project.
- Use `search_context` or `recall_context` before major architecture, product, or process decisions.
- Use `add_memory` only for clearly confirmed durable facts. Use `checkpoint_context` before compaction risk, task switches, or milestone saves, and `save_context` when you finish a meaningful unit of work.
- If a Relay recall/search returns nothing, investigate locally and save only confirmed durable findings, not the empty search attempt.
- Do not overuse Relay when the current conversation already contains the necessary context.
