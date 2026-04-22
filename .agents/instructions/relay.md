# Relay Guidance

- Start or resume with `get_brief`. Only call `list_projects` and `set_current_project` if Relay reports project ambiguity or resolves to the wrong project.
- Use `search_context` or `recall_context` before major architecture, product, or process decisions when local context may be incomplete.
- Use `add_memory` only for clearly confirmed durable facts. Use `checkpoint_context` for meaningful milestones or before compaction-equivalent risk. Use `save_context` when you finish a meaningful unit of work.
- Do not save speculative brainstorming until it is confirmed.
- Do not overuse Relay when the current conversation already contains the necessary context.
