# Relay selective open source strategy

Date: 2026-04-13
Status: strategic recommendation

## Recommendation

Do not fully open source Relay right now.

Reasons:
- product shape is still settling
- repo still needs cleanup and hygiene work
- core moat is still execution and productization, so giving away everything too early is not necessary
- full transparency is not required to build trust initially

## Better near-term strategy

Use selective openness.

Potentially open-sourceable later:
- parts of the LongMemEval harness
- adapters
- formatters
- small shared utilities/schemas
- maybe a stripped-down local memory sidecar or examples

Keep closed for now:
- hosted product glue
- core canon/truth orchestration
- billing and plan routing
- growth-sensitive backend logic
- product-specific UI and workflow orchestration

## Why this works

- gives users some trust
- gives contributors something useful
- avoids donating the whole product too early
- keeps future flexibility

## Prerequisites before opening anything

- repo cleanup and security audit
- secret rotation if needed
- dependency/license review
- clear boundary between public-safe and private code
