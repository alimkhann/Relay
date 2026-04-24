---
name: relay-context
description: Use Relay MCP intelligently for project briefs, context lookup, and durable saves without noisy writes.
license: Proprietary
compatibility: relay-mcp
metadata:
  author: Relay
  workflow: continuity
---

## When to use this skill

Use this skill when you are resuming work, switching projects, or deciding whether to read from or write to Relay.

## Recommended Relay flow

1. Start with `get_brief`.
2. Only if Relay reports project ambiguity or the wrong project, call `list_projects` and then `set_current_project`.
3. Use `search_context` or `recall_context` before major architecture, product, or process decisions when local context may be incomplete.
4. Save back deliberately:
   - `add_memory` only for clearly confirmed durable facts
   - `checkpoint_context` before compaction risk, task switches, or explicit milestones
   - `save_context` when wrapping a meaningful unit of work

## What to avoid

- Do not read Relay repeatedly when the current local conversation already has enough context.
- Do not write after every turn.
- Do not save speculative brainstorming until it is clearly confirmed.
- Do not call `save_context` just to restate work that is still in progress.
