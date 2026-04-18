# Relay Copilot Overlay

The canonical repository policy is in `AGENTS.md`. Follow it first.

Additional VS Code / Copilot guidance for this repo:

- Prefer `AGENTS.md` and this file over inventing new repo conventions.
- Keep tool use deliberate and low-noise: one targeted search pass, then read only the needed files.
- Prefer `pnpm test:stable` for routine validation. Use the full `pnpm test` only when necessary.
- Do not touch `apps/extension` unless explicitly requested.
- If you change MCP client support, update the shared compatibility registry, installer behavior, docs, and tests together.
