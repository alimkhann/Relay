# Claude Mem review for Relay

Date: 2026-04-13

Repo reviewed: `https://github.com/thedotmack/claude-mem`

## Bottom line

Worth borrowing a few patterns, not worth copying architecturally.

## Useful ideas for Relay

- progressive retrieval UX (`search -> timeline -> get_observations` style)
- fail-open behavior for capture hooks
- durable queueing before heavier processing
- lightweight file-context / focused-context hints
- privacy tags / exclusions before persistence

## Not a fit to copy directly

- local-worker/local-db architecture
- Claude-specific hook/session wiring as the central model
- narrow local memory plugin assumptions

Relay should borrow:
- UX and resilience ideas

Relay should not borrow:
- the overall storage/runtime architecture
