# Relay repo cleanup and security audit plan

Date: 2026-04-13
Status: planning artifact

## Goals

- reduce accidental secret exposure risk
- prepare the repo for possible partial open source later
- make the codebase easier for contributors, future hires, investors, and users to inspect
- reduce junk, dead paths, and misleading artifacts

## Phase 1 - secret and environment audit

1. Audit all env files and examples
- `.env*`
- benchmark env files
- extension env files
- docs examples

2. Audit for hardcoded secrets and sensitive identifiers
- API keys
- bearer tokens
- webhook signing secrets
- private connection strings
- local-only seeded ids that should not be assumed globally

3. Audit repo history risk
- check whether any real secrets were ever committed
- if yes, rotate first, then decide whether history rewrite is necessary

4. Audit generated outputs and caches
- benchmark results
- local hypothesis files
- local logs
- debug artifacts
- screenshots and recordings

## Phase 2 - structure cleanup

1. Identify dead or secondary product paths
- CLI-related product/UI/docs surfaces if MCP-first strategy continues
- old onboarding remnants
- duplicate docs or stale benchmark notes

2. Identify packages or surfaces that should remain private vs maybe open later
- keep closed: core product logic, hosted glue, billing, plan routing, truth maintenance internals
- maybe open later: harness pieces, adapters, formatters, some schemas/utilities

3. Reduce repo junk
- remove stale experiment files
- move benchmark research/artifacts into clearly scoped folders
- document what is canonical vs historical

## Phase 3 - dependency and operational audit

1. Review package dependencies
- remove unused dependencies
- flag risky or abandoned packages
- check extension/browser permissions and third-party scripts

2. Review auth and token surfaces
- extension tokens
- MCP tokens
- webhook endpoints
- billing callbacks

3. Review data-retention behavior
- archived memory
- compacted memory
- work sessions
- benchmark artifacts

## Phase 4 - repository hardening for optional open source later

1. Create a clean public/private inventory
2. Mark internal-only docs/codepaths
3. Decide whether to split out openable packages later
4. Add/refresh SECURITY.md, CONTRIBUTING.md, and stronger examples if public release ever happens

## Practical checklist

### Do soon
- scan for secrets and sensitive ids
- normalize env examples
- clean benchmark assumptions that encode local-only values
- reduce stale docs and duplicate roadmap artifacts

### Do later
- full history rewrite only if a real secret leak is confirmed
- repo splitting only if selective open source becomes real
- CLI removal only after product decision is final

## Current recommendation

- do not fully open source the whole repo yet
- do clean it as if partial open source might happen later
- rotate first, rewrite history second, only if needed
