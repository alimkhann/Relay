# Memory Strategy And Extension Reliability Notes

## Current Quality Signal

- Manual save worked for the April 29 ChatGPT battle-test session. Relay captured the session, produced a structured digest, and updated project state with the dogfooding strategy, scorecard, and real-project validation decision.
- Capture quality was directionally good but too lossy for execution-grade continuity. It saved the strategic decisions, but did not preserve every useful evaluation row and concrete test task from the visible answer.
- Inserted-brief pollution appears controlled. The extension already filters Relay-inserted context and asks the digest to use only the user delta and novel assistant output.

## What Matters To Coding Agents

- Current objective, recent progress, current constraints, and unresolved blockers.
- Files/modules touched, relevant commands, failing tests, migrations, env variables, public APIs, schema changes, and exact errors.
- Decisions with rationale when they prevent re-litigation.
- Next action that is concrete enough to execute immediately.
- Small exact snippets only when the exact text matters: function signatures, API payloads, SQL fragments, config keys, error messages, and command lines.

## Competitor Baseline

- Mem0 currently markets agent-generated memory extraction, entity linking, hybrid semantic/BM25/graph retrieval, and high LongMemEval performance. Product implication: Relay should improve extraction quality and retrieval precision, but should not chase generic personal-memory benchmarks as the main proof.
- Zep/Graphiti emphasize temporal graphs, provenance, relationship-aware retrieval, and MCP graph tools. Product implication: Relay needs stronger explainability and source tracing for why context appears, changes, or gets archived.
- Nia focuses on repo/docs/web indexing and retrieval for coding agents. Product implication: Relay should not become a worse Nia clone; docs/code indexing belongs in a later integration layer that feeds project memory only when it affects durable project state.

## Relay Differentiation Hypothesis

Relay should win when the question is: "Can the next AI session continue the project correctly across tools and time?"

That means the product should optimize for:

- Cross-surface deltas: what ChatGPT needs from Claude/Codex/Perplexity, and what coding agents need from browser planning.
- Truth governance: current decisions should supersede stale ones without hiding provenance.
- Lean insertion: browser chats get compact missing context; coding agents get operational execution context.
- Fast perceived saves: capture acknowledgement should be quick, with digest/reconcile running in the background.

## Near-Term Product Moves

- Make manual saves visibly say where the chat is being saved.
- Default browser insertion to a smart delta instead of a full wall of text.
- Keep full bootstraps available for explicit cold starts.
- Add MCP writeback readiness checks so users can see whether their client has real lifecycle hooks or instruction-only behavior.
- Build Relay-native evaluation around re-briefing reduction, fresh-session startup quality, capture relevance, stale-context avoidance, and cross-tool handoff success.
