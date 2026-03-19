# Plan After Core Hardening

This file tracks useful next work that is intentionally out of scope for the final core continuity hardening pass.

## Admin / Observability

- Internal health dashboard for capture success, digest strategy mix, fallback rate, routing ambiguity rate, token refresh failures, and bootstrap cache hit rate.
- Lightweight operator metrics by surface: browser, extension, MCP, CLI.
- Per-platform adapter failure tracking for ChatGPT, Claude, Gemini, Grok, DeepSeek, Perplexity, Codex.
- AI spend and token usage summary by project and user.

## Dashboard / Product UX

- Work-session timeline with checkpoints across browser, MCP, and CLI.
- Provenance / trust view for decisions, constraints, and tasks.
- Capture quality analytics: duplicate skips, digest strategy, stale state windows.
- Routing confidence board for extension associations and bindings.
- Brief freshness and continuity delta panel.
- Usage / plan pressure panel tied to captures, MCP reads/writes, handoffs, and retention.

## Settings / Docs Coverage

- Default target profile controls in settings.
- Rich MCP connection management in settings.
- Extension routing/bindings management in settings.
- Docs for automatic MCP work sessions and checkpoint behavior.
- Docs for extension routing, adjudication, bindings, and troubleshooting.
- Docs for truth scoring, reaffirmation, disputes, and continuity maintenance.

## Optional AI Expansion

- Small rewrite pass for deterministic digest summaries when quality is borderline.
- Optional bootstrap refinement pass for high-value fresh-chat briefs only.
- Reaffirmation validation jobs for old foundational facts.
- Low-cost evidence tagging / authority classification pass for imported history.

## Broader Integrations

- Gmail
- Calendar
- Notion
- Linear
- Slack
- GitHub issues / PR discussion context

## Longer-Term Model Evolution

- First-class claim graph with explicit supersedes / contradicts / derived-from edges.
- More explicit memory claim lifecycle.
- Stronger multi-claim conflict resolution and lineage.
