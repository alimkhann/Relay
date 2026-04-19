# Open Source Readiness Checklist

This repo is not open source yet. This checklist tracks what still needs cleanup before a public release.

## Must Be Clean Before Public

- Remove private reviewer and launch artifacts from the repo root
- Remove or relocate sales / pitch material from the repo root
- Move internal research out of the shipping repo or keep it fully ignored
- Audit tracked env-like files and key material
- Review package metadata, homepage, bugs, and support links
- Replace the placeholder `LICENSE` with the final public license

## Current Known Debt

- Root-level tracked private artifacts still exist, including:
  - `Chrome Web Store_ Rejection notification for Relay — AI Chat Memory & Context Sync.eml`
  - `relay_pitch_v2.pptx`
- Internal research is currently stored under `research/`
- Local packaging leftovers such as zip bundles should stay ignored and out of future history

## Enforcement Direction

- Treat `AGENTS.md` as the repo hygiene policy for agents
- Keep new private artifacts out of the repo root
- Keep publishable package docs aligned with actual support claims
