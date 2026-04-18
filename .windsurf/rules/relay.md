# Relay Windsurf Overlay

The canonical repository policy is in `AGENTS.md`. Follow it first.

Windsurf-specific guidance for Relay:

- Treat this file as a small supplement to `AGENTS.md`, not the main policy source.
- Relay installs Windsurf hooks for `post_cascade_response_with_transcript` and `post_mcp_tool_use` when supported.
- If those hooks are unavailable, call `checkpoint_context` before switching tasks or threads and after a meaningful unit of work.
