# Relay Guidance

- Start with Relay when resuming work: `list_projects`, `set_current_project` if needed, then `get_brief`.
- Use `search_context` or `recall_context` before major architectural changes.
- Use `add_memory` for durable single facts, `checkpoint_context` for milestones, and `save_context` when you finish a meaningful unit of work.
- Do not overuse Relay when the current conversation already contains the necessary context.
