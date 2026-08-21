<!-- BEGIN RELAY MANAGED BLOCK: copilot -->
## Relay for VS Code / Copilot

- Start or resume with `get_brief`. Only call `list_projects` and `set_current_project` if Relay reports project ambiguity or the wrong project.
- Before architecture, product, or process decisions, prefer `recall` when local context may be incomplete.
- Use `recall` when you need the structured objective, constraints, open tasks, source tracing, sessions, activity, or briefs.
- Use `save` action `add_memory` only for clearly confirmed durable facts: decisions, constraints, tasks, and stable product truths. Do not save speculative brainstorming until it is confirmed.
- If Relay recall returns nothing, continue with normal local investigation. If that investigation discovers confirmed durable facts, save those facts; do not save the empty recall attempt itself.
- If `get_brief` or `recall` shows stale, completed, contradicted, or superseded context, clean it up with `save` action `manage_memory` or `set_state`.
- For coding work, save files/modules touched, public API or schema changes, migrations, tests run, unresolved blockers, and next steps when those facts would help a future session continue.
- Use `save` action `checkpoint` only before compaction-equivalent risk, task switches, or explicit milestone saves. Use `save` action `save_session` only when wrapping up a meaningful unit of work.
- Use `save` action `checkpoint` only at meaningful milestones, before switching tasks, or before compaction-equivalent actions.
- Avoid repeated Relay reads or writes when the current local conversation already contains the needed context.
<!-- END RELAY MANAGED BLOCK: copilot -->
