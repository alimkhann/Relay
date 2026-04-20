# Relay Continuity And Context Roadmap

## Near-term priority

Relay should prioritize continuity explainability and governance before shipping a standalone Relay chat agent.

Relay already has two agentic continuity pipelines:

- browser capture -> digest strategy -> AI digest/deferred/skip -> memory creation -> project state merge -> reconciliation -> canon observation -> continuity maintenance
- MCP/work-session save -> structured digest -> project state merge -> reconciliation -> canon observation -> brief invalidation

The current product gap is trust and inspection, not the absence of AI.

## Immediate MCP additions

Add these first:

- `list_memory`
- `get_memory`
- `list_sessions`
- `archive_session`
- `list_briefs`
- `regenerate_brief`
- `delete_brief`
- `trace_context_sources`
- `list_recent_activity`

Do not bloat MCP with broad destructive admin tools or regex cleanup flows yet.

## Future features by ROI and ease

1. Continuity explainability and MCP governance
2. Document and file ingestion
3. Selective integrations like Notion, Linear, Gmail, and Calendar
4. Dashboard governance surfaces for disputes, stale sessions, and traceability
5. In-dashboard Relay chat agent
6. Extension sidebar Relay chat agent
7. Voice input and model picker
8. Team and enterprise shared scoped memory

AI video/image expansion is intentionally deferred for now and should not be treated as a near-term roadmap item until product scope and user demand are clearer.
