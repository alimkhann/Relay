# Relay Agent Guide

This is the canonical repository policy for coding agents working in Relay. Client-specific files such as `CLAUDE.md`, `GEMINI.md`, Cursor rules, Windsurf rules, and Copilot instructions are thin overlays and must not duplicate this file.

## Mission

- Keep changes small, coherent, and reviewable.
- Preserve user-facing stability. Relay has live users, so treat regressions as expensive.
- Prefer the active implementation path over dead or duplicated code.

## Repo Shape

- Monorepo: `apps/web`, `apps/extension`, `packages/*`, `tests`, `scripts`.
- MCP and coding-agent integration work lives mainly in:
  - `packages/shared/src/constants/mcp-clients.ts`
  - `packages/cli-core/src/*`
  - `packages/cli/src/*`
  - `packages/wizard/src/*`
  - `packages/mcp/src/*`
  - `apps/web/src/app/docs/mcp/page.tsx`
- Root docs are intentionally limited. Only these repo-owned root docs should exist:
  - `README.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `GEMINI.md`
  - `CONTRIBUTING.md`
  - `SECURITY.md`
  - `SUPPORT.md`
  - `LICENSE`
  - `DEPLOYMENT.md`
  - `RELEASING.md`
- Put agent reference material that does not rely on reserved filenames in `docs/agents/`.
- Put internal planning, research, launch notes, and archived handoff docs in `docs/internal/` or the relevant feature-specific research folder.

## Cost And Tool Discipline

- Prefer one targeted search pass before opening files.
- Use `rg`/`rg --files` for search.
- Batch related file reads instead of repeatedly opening single files.
- Avoid repeated searches for the same symbol unless the code changed.
- Avoid browsing unless freshness or exact source verification matters.
- Prefer targeted tests over reflexively running the full suite.

## Edit Discipline

- Do not rewrite unrelated files.
- Do not remove or revert user changes you did not make.
- Use ASCII unless a file already needs Unicode.
- Keep comments rare and high-signal.
- If you change a client integration surface, update the registry, installer, docs, and tests in the same change.
- Do not create one-off markdown notes in the repo root.
- One-off research or handoff docs should use dated, slugged filenames under `docs/internal/archive/`, `docs/internal/research/`, or a feature-specific archive folder.
- Local client state is never repo-owned. Do not commit `.claude/`, `.opencode/`, machine-local MCP config, `settings.local.json`, caches, packaged bundles, reviewer mail, or pitch material.

## Commands

- Install: `pnpm install`
- Lint: `pnpm lint`
- Repo audit: `pnpm repo:check`
- Typecheck: `pnpm typecheck`
- Stable CI tests: `pnpm test:stable`
- Full suite: `pnpm test`
- E2E: `pnpm test:e2e`
- Web build: `pnpm build`
- Publish dry runs: `pnpm release:dry-run`

## Testing Defaults

- Start with the smallest affected tests.
- For repo cleanup and hygiene changes, run `pnpm repo:check` first.
- For install / standards / docs / billing work, prefer `pnpm test:stable`.
- Run the full `pnpm test` only when the changed area warrants it or before high-risk merges.
- If the full suite is already known to have unrelated failures, do not block useful work on them; report them clearly.

## Agent Standards

- `AGENTS.md` is the shared core for Codex, Warp, OpenCode, Cursor, Windsurf, and compatible tools.
- `CLAUDE.md` is a Claude-specific overlay.
- `GEMINI.md` is a Gemini-specific overlay and may import this file.
- `.github/copilot-instructions.md` is a Copilot-specific overlay.
- `.cursor/rules/*` and `.windsurf/rules/*` should contain only client-specific deltas.

## Relay-Specific Behavior

- Relay hook-capable clients should rely on native lifecycle hooks for autosave.
- Relay MCP exposes six public tools: `get_brief`, `recall`, `sources`, `save`, `list_projects`, and `set_current_project`.
- Use `recall` for memory search, state inspection, source tracing, sessions, activity, and briefs.
- Use `sources` for project source lifecycle: resolve, index, search, read, refresh, import, promote, delete, and purge.
- Use `save` for session writeback, checkpoints, durable memory, memory cleanup, state updates, and brief/session maintenance.
- If Relay context is stale, completed, contradicted, or superseded, clean it up with `save` action `manage_memory` or `set_state`.
- Durable facts about the USER go to personal memory: pass `projectId: "personal"` to `save`/`add_memory`. Relay auto-classifies them into Folk-style categories (person, company, concept, event, meeting, signals, note) — write the atomic fact, do not set the category.
- Hookless clients should call `save` action `checkpoint` only at meaningful boundaries:
  - before compaction-equivalent actions
  - before switching threads or tasks
  - after completing a logical unit of work
- Do not add per-turn autosaves unless explicitly requested.

## Release-Sensitive Changes

- If you change installer behavior, expect to republish `@onrelay/wizard` and usually `@onrelay/cli`.
- If you change MCP runtime behavior or shipped MCP docs/examples, expect to republish `@onrelay/mcp`.
- If you change hosted MCP contract or install metadata, review whether `smithery.yaml` also needs an update.
