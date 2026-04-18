# Relay Autosave Hooks — Claude Code

Autonomous save-before-compact / session-end for Claude Code users of Relay.

These hooks call `relay-flush`, which walks any open Relay work sessions in
your current project through the digest → reconcile → close pipeline before
Claude Code compacts context or ends the session.

No slash commands. No prompt engineering. The hook runs automatically, even
if the session crashes mid-thought.

---

## Install

### Prerequisites

1. **`@onrelay/mcp` installed** — the relay-flush binary ships with it:
   ```bash
   npm install -g @onrelay/mcp
   # or
   pnpm add -g @onrelay/mcp
   ```

2. **Relay config exists** — run `npx @onrelay/wizard` once to log in, pick a project.
   This writes `~/.relay/mcp.json` with your token and project id.

### One-line install

```bash
relay-flush install-claude-code
```

This merges the hook config below into `~/.claude/settings.json`. Re-run
anytime to refresh.

### Manual install

Add this to `~/.claude/settings.json` (or `.claude/settings.json` in a
project directory to scope it to that project):

```json
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "relay-flush precompact --quiet"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "relay-flush session_end --quiet"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "relay-flush stop --quiet"
          }
        ]
      }
    ]
  }
}
```

Then restart Claude Code. Confirm hooks loaded via `/hooks`.

---

## What each hook does

| Hook        | When it fires                                        | Why we flush  |
|-------------|------------------------------------------------------|---------------|
| `PreCompact`| Right before Claude Code compacts the chat           | Catch everything before the context is summarized. |
| `SessionEnd`| When the session ends (normal exit)                  | Graceful save on close. |
| `Stop`      | When the user interrupts / stops the agent           | Save partial progress before handing control back. |

All three run the same command. The `reason` argument is telemetry-only — the
flush itself always does the same thing: sweep any open sessions for this
project, run digest + reconcile, close them.

---

## Multiple projects

`relay-flush` reads the project id from `~/.relay/mcp.json`. To override per
workspace, set `RELAY_PROJECT_ID` in your shell:

```bash
export RELAY_PROJECT_ID=<project-uuid>
```

Or pass explicitly in the hook command: `relay-flush precompact --project=<uuid>`

---

## Uninstall

Remove the three entries from `~/.claude/settings.json`.
