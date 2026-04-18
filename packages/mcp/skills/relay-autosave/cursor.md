# Relay Autosave — Cursor

Cursor does not yet ship a real hook API (no equivalent to Claude Code's
`PreCompact`, `SessionEnd`, `Stop`). Until it does, Relay gives you two
autonomy paths for Cursor that work **today** and converge on the same flush
pipeline as the Claude Code hook setup.

---

## Path 1 — Opportunistic sweep (fully automatic, recommended)

Relay's MCP HTTP stream route runs an in-request sweep at the head of every
call. If you use Relay's `get_brief`, `recall_context`, `save_context`, or
any other tool from Cursor, stale open work sessions for your project are
flushed automatically before your request runs. Throttled to once per user
every 30 seconds so it never adds meaningful latency.

**You get this for free.** No install, no config. As long as Relay's MCP
server is wired into Cursor, your sessions will flush whenever you next
touch Relay from Cursor.

This covers:
- Closing Cursor without saving.
- Cursor crashing mid-agent-loop.
- Your laptop sleeping / network dropping.

---

## Path 2 — Explicit pre-compact command (zero-latency belt-and-braces)

If you want an explicit save right before Cursor's context gets large, add
this one-line shell task so you can run it via `Ctrl/Cmd+Shift+P → Run Task`:

1. Create `.vscode/tasks.json` in your project (or append to an existing one):

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Relay: flush session",
      "type": "shell",
      "command": "relay-flush explicit --quiet",
      "problemMatcher": [],
      "presentation": { "reveal": "silent", "panel": "dedicated" }
    }
  ]
}
```

2. Make sure `relay-flush` is on your PATH (`pnpm add -g @onrelay/mcp`).

3. Optional: bind the task to a keybinding in `keybindings.json`:

```json
[
  {
    "key": "cmd+shift+r cmd+f",
    "command": "workbench.action.tasks.runTask",
    "args": "Relay: flush session"
  }
]
```

4. Hit the binding any time you're about to compact, exit, or start a new
   thread. The flush is synchronous and fast (~200 ms typical).

---

## Path 3 — Agent instruction snippet (for Cursor's built-in agent)

If you drive Cursor via its built-in Composer/Agent, you can instruct the
agent to call Relay's `checkpoint_context` tool at natural break points.
Paste this into your project's `.cursorrules` (or the top of your prompt):

```
When you finish a logical unit of work — a refactor, a feature, a bug fix
or before summarizing context — call the Relay MCP tool `checkpoint_context`
with the current decisions, constraints, and next steps. This keeps Relay
in sync with your progress so that the next session picks up exactly where
this one left off.
```

This is less reliable than Paths 1 & 2 (agents forget) but adds an extra
flush point when the others can't reach.

---

## Status & next steps

- Path 1 is the default. You already have it.
- Paths 2 & 3 are layered optional autonomy. Neither requires Cursor to
  support hooks natively.
- When Cursor ships a real hook API, Relay will add first-class Cursor
  hook setup instead of relying on these fallback paths.
