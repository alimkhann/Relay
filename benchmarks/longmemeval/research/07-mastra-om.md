# 07. Mastra OM

Repos:
- `https://github.com/mastra-ai/mastra`
- `https://github.com/mastra-ai/mastra-observational-memory-workshop`
Local clones:
- `/Users/alim/Research/relay-longmemeval/mastra`
- `/Users/alim/Research/relay-longmemeval/mastra-observational-memory-workshop`
Status: open, highest-signal OSS architecture in this research set

## Architecture

- Observational Memory is a prompt-managed compression layer over chat history.
- Core engine is `ObservationalMemory` in `packages/memory/src/processors/observational-memory/observational-memory.ts`.
- Processor lifecycle is in `packages/memory/src/processors/observational-memory/processor.ts:83-300`.
- The answering agent does not query a vector DB; it receives stable injected memory context plus recent raw turns.

## Observer

- Observer logic lives in:
  - `observer-agent.ts`
  - `observer-runner.ts`
- Key symbols:
  - `buildObserverSystemPrompt()`
  - `buildObserverTaskPrompt()`
  - `parseObserverOutput()`
  - `ObserverRunner.call()`
- Observer extracts dense observations, `currentTask`, `suggestedResponse`, and optionally `threadTitle`.
- Prompt explicitly tells the model to preserve important user assertions, split multi-event observations, and group repeated tool actions.

## Reflector

- Reflector logic lives in:
  - `reflector-agent.ts`
  - `reflector-runner.ts`
- Key symbols:
  - `buildReflectorSystemPrompt()`
  - `buildReflectorPrompt()`
  - `validateCompression()`
  - `ReflectorRunner.call()`
  - `ReflectorRunner.maybeReflect()`
- Reflector periodically compresses active observations into a smaller generation.
- The workshop claims about `3-6x` compression are documentary claims; the code does not hardcode a `6x` target.

## How compression actually works

- Most compression comes from write-time abstraction:
  - Observer stores distilled observations instead of raw turns.
  - Reflector rewrites those observations into an even more compact active log.
- Async reflection targets about `75%` of the sliced observation input in `reflector-runner.ts:428-435`, but that is not the same as end-to-end ratio.
- This is better understood as multi-stage lossy but task-oriented compression, not a magic codec.

## Synchronous vs batch

- Both exist.
- Strategy selection is in `observation-strategies/index.ts:19-38`.
- `SyncObservationStrategy` handles normal threshold-triggered observation.
- Async buffering is built into `observational-memory.ts:1791-1978`.
- Resource-scoped observation batches across threads in `observation-strategies/resource-scoped.ts:206-249`.

## Context construction

- Final actor context is built by `buildContextSystemMessages()` in `observational-memory.ts:2314-2340`.
- Context contains:
  - instructions/preamble
  - active observations
  - `currentTask`
  - `suggestedResponse`
  - continuation hint from `constants.ts:43-54`
- Recent unobserved raw messages are still included, which avoids the brittleness of all-summary memory systems.

## Memory store schema

- Authoritative OM record schema is in `packages/core/src/storage/types.ts:1034-1155`.
- Important stored state includes active observations, buffered observations, buffered reflection, cursors, and generation metadata.
- This is a real state machine, not just a table of summaries.

## Benchmark evidence

- LongMemEval harness exists in:
  - `explorations/longmemeval/src/commands/run.ts`
  - `explorations/longmemeval/src/config.ts`
  - `explorations/longmemeval/src/evaluation/longmemeval-metric.ts`
- Workshop materials report `84.2%` with `gpt-4o` and `94.9%` with `gpt-5-mini` in `slides/slides-v3/04-the-proof.html:330-471`.
- I did not find checked-in raw run artifacts proving those exact numbers.

## Relay implications

- This is the strongest evidence in the set that architecture quality amplifies model quality.
- Best transferable idea: add an Observer/Reflector layer above raw `memory_items`, not instead of them.
- Minimal version for Relay:
  - derive observation records from captured turns
  - periodically generate session/project reflections
  - inject stable summaries plus recent raw evidence into answer prompts
- Full Mastra-style runtime would require a dedicated OM state table and buffering/generation machinery.
- Recommendation: start with a lightweight offline Observer/Reflector overlay, then test whether it closes the multi-session gap before building a full OM runtime.
