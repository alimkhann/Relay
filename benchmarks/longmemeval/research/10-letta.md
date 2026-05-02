# 10. Letta

Repo: `https://github.com/letta-ai/letta`
Local clone: `/Users/alim/Research/relay-longmemeval/letta`
Status: open, mature memory system, indirect fit for LongMemEval

## Tiered memory model

- Core/in-context memory is rendered from `Memory.blocks` in `letta/schemas/memory.py:688` and injected through `compile_system_message()` in `letta/services/helpers/agent_manager_helper.py:251`.
- Recall memory is conversation history search via `conversation_search()` in `letta/services/tool_executor/core_tool_executor.py:81`.
- Archival memory is a separate long-term passage store written via `archival_memory_insert()` in `core_tool_executor.py:307` and searched through `search_agent_archival_memory_async()` in `letta/services/agent_manager.py:2534`.

## Search across tiers

- Standard Letta does not unify recall and archival into one brokered retrieval path.
- Recall search hits message history; archival search hits passage memory.
- The only clearly cross-tier search flow is in voice mode through `search_memory` in `letta/functions/function_sets/voice.py:64` and `VoiceAgent._search_memory()` in `letta/agents/voice_agent.py:476`.

## Compression / compaction

- Mainline compaction is mostly in-context summarization, not archival promotion.
- Legacy summarization path is `Summarizer._partial_evict_buffer_summarization()` in `letta/services/summarizer/summarizer.py:136`.
- Newer compaction machinery is under `services/summarizer/compact.py` and related files.
- Default thresholds live in `letta/settings.py:77`.

## Eviction / promotion policy

- Standard agents summarize overflowing context back into the message stream.
- They do not automatically promote everything into searchable archival memory.
- Promotion to core memory is manual through `core_memory_append()` and `core_memory_replace()` in `core_tool_executor.py:319` and `:328`.
- Voice sleeptime is the notable exception: it compresses evicted transcript chunks into retrievable memory using `VoiceSleeptimeAgent.store_memory()` in `letta/agents/voice_sleeptime_agent.py:164`.

## Relay implications

- Strongest transferable idea is tier separation, not Letta's exact implementation.
- Letta shows that explicit archival memory is useful, but it also shows the weakness of having recall and archival as disconnected search silos.
- Best template for Relay is actually Letta's voice sleeptime pattern: compress evicted conversational material into retrievable summaries.
- Recommendation: keep a unified retrieval broker across raw turns, session summaries, and durable canon; do not expose separate tiers that the answer path must manually juggle.
