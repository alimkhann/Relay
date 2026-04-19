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

1. Start with `list_projects`.
2. If the active project is ambiguous, call `set_current_project`.
3. Call `get_brief` to load the current working context.
4. Use `search_context` or `recall_context` before major decisions when local context may be incomplete.
5. Save back deliberately:
   - `add_memory` for durable single facts
   - `checkpoint_context` for milestones
   - `save_context` when wrapping a meaningful unit of work

## What to avoid

- Do not read Relay repeatedly when the current local conversation already has enough context.
- Do not write after every turn.
- Do not call `save_context` just to restate work that is still in progress.
