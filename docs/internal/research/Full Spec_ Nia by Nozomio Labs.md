<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Full Spec: Nia by Nozomio Labs


***

## What Is Nia?

Nia is an **agentic search and indexing API** — described as "the index and search layer for AI agents." It acts as a universal context layer that lets AI coding agents (Claude Code, Cursor, OpenCode, OpenClaw, etc.) retrieve real, up-to-date information from any source — code repos, documentation, PDFs, datasets, Slack, Google Drive, X/Twitter, local files, and the open web — instead of relying on stale training data.[^1_1][^1_2]

- **Company:** Nozomio Labs
- **Founder:** Arlan Rakh (@arlanr on X)
- **Backed by:** Y Combinator (Summer 2025 batch), \$6.2M seed round[^1_1]
- **Investors include:** CRV, BoxGroup, Paul Graham, Localglobe, Joshua Schachter (del.icio.us), Gustav Söderström (Spotify Co-President), Thomas Wolf (Hugging Face Co-founder), Gokul Rajaram[^1_3]
- **Users:** 1,000+ engineers at Google, Huawei, Mintlify, Stanford, Harvard, Columbia, Match Group, Cornell, UPenn, and more[^1_1]
- **API Base URL:** `https://apigcp.trynia.ai/v2`
- **Auth:** `Authorization: Bearer YOUR_API_KEY`

***

## Installation

Quick install via wizard (auto-detects your IDE, creates account, generates API key):

```
npx nia-wizard@latest
# also: yarn dlx / pnpm dlx / bunx nia-wizard@latest
```

Can also be installed as: **CLI daemon**, **MCP server**, **Agent Skill**, or **Plugin** (OpenCode, OpenClaw, Claude Code).[^1_4]

***

## App Dashboard (app.trynia.ai) — Sidebar Sections

From what's visible in your account (Builder plan):[^1_5]


| Section | Description |
| :-- | :-- |
| **Home** | Quick-start, API key display, 7-day usage chart |
| **Vaults** | Agent-maintained personal wiki layered on indexed sources |
| **Overview** | Usage, limits, and activity metrics |
| **Activity** | Log of indexing/search operations |
| **Explore** | Global source database — browse pre-indexed community sources |
| **Contexts** | Saved conversation states for cross-agent handoffs |
| **Research** | In-house research agents (Oracle, Tracer) |
| **Search** | Search across all indexed sources |
| **Documents** | Index and chat with PDFs |
| **Datasets** | Index HuggingFace datasets |
| **API Keys** | Manage API keys |
| **Docs** | External link to docs.trynia.ai |
| **Billing** | Subscription + invoices |
| **Integrations** | Connect Slack, Google Drive, Notion, Confluence, Jira, etc. |
| **Answer Model** | Configure the LLM used for synthesizing answers |
| **Local Sync** | Daemon for syncing local folders, databases, chat history |
| **Context Transfer** | Cross-agent context handoff feature |
| **Referral** | Referral program |


***

## 25 Capabilities (Full Capability Map)

### 1. Indexing \& Subscriptions

The `index` tool auto-detects input type:[^1_4]


| Input | Detected as |
| :-- | :-- |
| GitHub URLs | Repositories |
| arXiv URLs / PDF URLs | Research papers |
| HuggingFace dataset URLs | Datasets |
| `.csv`, `.tsv`, `.xlsx` | Spreadsheets |
| Local paths | Local folders |
| Other web URLs | Documentation |

- **`auto_subscribe_dependencies`**: Feed a `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, or `go.mod` — Nia auto-indexes all dependency docs
- **`manage_resource`**: List, status, rename, delete, subscribe to resources
- **Pre-indexed community sources**: Subscribe instantly to already-indexed sources (React, Next.js, Chromium, FastAPI, Vercel AI SDK, LangChain, etc.) — doesn't count against indexing quota
- **Branch/ref selection**: Repos support specific branches, tags, commit SHAs
- **Global source deduplication**: Auto-reuse existing indexes


### 2. Search, Read \& Explore

- **`search`** — Hybrid vector + BM25 semantic search across all indexed sources with streaming; supports multi-source queries and source filters
- **`nia_grep`** — Regex pattern matching across repos, docs, Drive, folders, datasets, Slack
- **`nia_read`** — Read files/pages/rows from any indexed source with line ranges
- **`nia_explore`** — Browse file trees, directory listings, dataset schemas
- **`get_github_file_tree`** — Inspect any public GitHub repo structure live without indexing

**Universal search modes** (via `/search` endpoint):


| Mode | Use for |
| :-- | :-- |
| `query` | Multi-source AI search with conversation messages |
| `universal` | Vector + BM25, no LLM synthesis |
| `web` | Web search with category/date filtering |
| `deep` | Multi-step research with citations |

### 3. Research Agents

**`nia_research`** — Three modes:


| Mode | Best for |
| :-- | :-- |
| `quick` | Fast web + source discovery |
| `deep` | Comparisons, multi-source analysis |
| `oracle` | Complex multi-step autonomous investigations |

**`nia_advisor`** — Analyzes your code against indexed docs, gives grounded recommendations

**Oracle Research Agent** — Autonomous, three-phase (DISCOVER → INDEX → SEARCH):

- Tools: `nia_web_search`, `doc_tree`, `doc_ls`, `doc_read`, `doc_grep`, package source analysis
- Real-time SSE streaming, job-based execution, retry/reconnect
- Can chat with results after generation
- Endpoints: `POST /v2/oracle`, `POST /v2/oracle/jobs`, `GET /v2/oracle/jobs/{id}/stream`


### 4. Document Agent

Deploy an autonomous AI agent **into a specific PDF or document**. Plans strategy, calls tools, follows cross-references, synthesizes cited answers.


| Feature | Detail |
| :-- | :-- |
| Inline citations | Page-, section-, content-level on every claim |
| Structured output | Provide `json_schema`, get typed extraction |
| Extended thinking | Configurable `thinking_budget` (1,000–50,000 tokens) |
| Streaming | SSE event stream |
| Model selection | Opus 4.7 (1M ctx), Sonnet 4, Haiku 3.5 |

Models:


| Model | Context | Best for |
| :-- | :-- | :-- |
| `claude-opus-4-7` | 1M tokens | Complex reasoning |
| `claude-sonnet-4-20250514` | 200K | Balanced |
| `claude-haiku-35-20241022` | 200K | Quick lookups, high-volume |

Use cases: Legal contracts, SEC filings (10-K/10-Q), research papers, engineering docs, audit reports.[^1_4]

### 5. Data Extraction (from PDFs)

Three modes:

- **Table extraction**: Provide JSON schema → array of matching records (`POST /v2/extract`)
- **Detect extraction**: Locate visual elements (tables, figures, charts), returns bounding boxes + confidence scores, can render annotated page images
- **Engineering extraction**: For technical docs (P\&IDs, schematics, datasheets), supports `fast` or `precise` accuracy mode, follow-up queries without re-processing

Job lifecycle: `queued → processing → completed | failed`

### 6. Vault — Agent-Maintained Personal Wiki

Layered knowledge base: raw indexed sources → LLM-generated wiki → co-evolved schema.

**Three layers:**

1. Raw sources (read-only)
2. The wiki (markdown pages agent generates)
3. The schema (`schema.md` co-evolved by user + agent)

**Page structure:** Compiled Truth (above `---`) + Timeline (append-only evidence trail). Cross-references use `[[wikilinks]]` with typed relationships (`uses`, `extends`, `contradicts`, etc.)

**Key CLI commands:** `nia vault init`, `ingest`, `sync`, `refresh`, `lint`, `dream`, `auto-dream on`, `open`, `search`, `agents`

**Layout:**

```
schema.md / index.md / log.md / META.md
concepts/   # LLM-generated concept pages
entities/   # people, products, tools, papers
notes/      # user-curated, never overwritten by sync
```

**Web UI:** Page tree sidebar, force-directed graph view, TipTap rich editor with wikilink autocomplete, `Cmd+K` search palette with fuzzy + AI Q\&A, dream/sync controls.

### 7. Context Sharing

Save and resume full agent conversation states across tools (plan in Cursor, execute in Claude Code).

**Memory types:** `scratchpad`, `episodic`, `fact`, `procedural`

**What gets saved:** conversation history, code snippets, edited files, plans, decisions, referenced sources, all Nia queries made

**`context` tool actions:** `save`, `list`, `retrieve`, `search`, `update`, `delete`

### 8. Local Sync

Standalone CLI daemon for syncing personal/local data with Nia.

**Supported local sources:**


| Category | Sources |
| :-- | :-- |
| Chat \& messages | iMessage, WhatsApp, Telegram |
| Apple ecosystem | Notes, Contacts, Reminders, Stickies |
| Browser history | Safari, Chrome, Brave, Edge, Firefox |
| Media \& files | Screenshots (w/ OCR), SQLite, regular folders |

**Limits:** 5,000 files/folder, 100 MB/folder, 5 MB/file, 1 GB DB, 100K rows/table

**Security:** 350+ exclusion patterns auto-protect `.env`, `.pem`, SSH keys, secrets, `node_modules`, etc. Credentials stored with `0600` permissions.

### 9. End-to-End Encryption (Zero-Knowledge)

Plaintext never leaves your device. Pipeline: Extract → Chunk → Embed (`zembed-1-2560`) → Encrypt (AES-256-GCM) → Blind Index (HMAC-SHA256) → Upload. Cloud only ever sees ciphertext + vectors.[^1_4]

### 10. Connectors

Generic framework for OAuth/API-key external sources: Notion, Confluence, Jira, and more. Supports multi-instance, scheduled sync, status tracking.

### 11. Scoped MCP Servers

Specialized MCP servers that focus on one specific source instead of all indexed data. Useful for narrow agent workflows.

### 12. Sandbox Search

Clones any public Git URL into an ephemeral VM, runs a read-only agent that traverses actual file trees without requiring pre-indexing. VM tears down after query.[^1_1]

### 13. Tracer — GitHub Search Without Indexing

Autonomous GitHub search sub-agent. No pre-indexing required. Powered by Claude Opus 4.7 with 1M context window. Spawns parallel sub-agents, supports multiple modes.

**Endpoints:** `POST /v2/tracer`, SSE streaming, job-based with retry.
Cost: 15 credits per run.[^1_3]

### 14. Package Search

Search PyPI, npm, Crates.io, Go modules, Ruby Gems without indexing. Free tier available.

### 15. Source Types Summary

| Type | Notes |
| :-- | :-- |
| GitHub repos | Any branch/ref/tag |
| Documentation sites | Any URL |
| PDFs / arXiv papers | Direct URL or paper ID |
| HuggingFace datasets | Any dataset |
| CSV / Excel / TSV | Spreadsheet indexing |
| Google Drive | OAuth integration |
| Slack | Workspace search |
| X (Twitter) | Timeline/user indexing |
| Local folders | Via Local Sync daemon |
| Generic connectors | Notion, Confluence, Jira, etc. |

### 16. Explore \& Chat

Web UI for cross-source Q\&A across pre-indexed knowledge. Browse the global source database at `app.trynia.ai/explore`.

### 17. agentsearch — Zero-Install Docs Filesystem

One-command Unix-like filesystem over any docs site. No account needed. For agents that need quick one-shot doc access.

### 18. SDKs \& Language Bindings

| SDK | Package |
| :-- | :-- |
| Python | `nia-ai-py` |
| TypeScript | `nia-ai-ts` |
| LangChain | `langchain-nia` |

### 19. Plugins (Agent-Native Integrations)

| Plugin | How |
| :-- | :-- |
| OpenCode | Install directly in OpenCode with research triggers, context handoffs, MCP |
| OpenClaw | Via ClawHub skill |
| Claude Code | Marketplace install for repo/doc/research workflows |

### 20. Partner Integrations

- **21st.dev** — Next.js template for GitHub repo chat agents powered by Nia + 21st Agents SDK[^1_6]
- **LangChain** — Native LangChain integration

***

## Benchmarks

Tested on a "bleeding-edge APIs" hallucination dataset where LLMs have never seen the features:[^1_1]


| Tool | Hallucination Rate |
| :-- | :-- |
| **Nia Oracle** | **52.1%** (best) |
| Context7 | 63.4% |
| Exa Code | 65.2% |
| Brave Search | 66.7% |
| no-RAG | 81% |
| GPT-5 Web | 89.6% |
| GPT-5 | 95.5% |

Claims: \#1 lowest error rate, 43.4% fewer errors than GPT-5, 11.3% ahead of next best tool. Test methodology: Claude 4.5 Sonnet \& GPT-5 at temperature=0.0, custom HallucinationClassifier judge, evaluated against docs only.[^1_1]

***

## Pricing

| Plan | Price | Key Limits |
| :-- | :-- | :-- |
| **Free** | \$0/forever | 3 lifetime indexes, 50 queries/mo, 20 web searches/mo, 5 contexts |
| **Builder** *(Popular)* | \$15/mo | 50 indexing/mo, 5 concurrent indexes, 1,000 queries/mo, 30 deep research, 200 web searches, 100 contexts, 30 Oracle/mo, 30 Tracer/mo (3 concurrent) |
| **Team** | \$50/seat/mo | 500 indexing/mo, 50 concurrent indexes, 5,000 queries/mo, 200 deep research, 1,000 web searches, 1,000 contexts, 200 Oracle/mo, 200 Tracer/mo (10 concurrent) |
| **Business** | \$99/seat/mo | Unlimited everything, 50 concurrent Tracer, dedicated support |
| **Enterprise** | Custom | All Business + SOC 2, SLA, onboarding, self-hosting |

**Yearly saves 17%.** Credit packs available (\$3–\$499 for 100–100K credits; ~\$0.005/credit at scale).

**Credit cost per operation:**

- Search / Context = 1 credit
- Indexing / Sync = 10 credits
- Deep Research / Oracle / Tracer = 15 credits[^1_3]

Educational/non-profit discounts available.

***

## Security \& Privacy

- SOC 2 (Enterprise tier)
- End-to-end encryption option (zero-knowledge)
- Opt-out of training data
- 350+ automatic exclusion patterns for sensitive files
- Rate limit headers on all endpoints

***

## Key Links

| Resource | URL |
| :-- | :-- |
| App | app.trynia.ai |
| Docs | docs.trynia.ai |
| GitHub | github.com/nozomio-labs/nia |
| Discord |  |

<div align="center">⁂</div>

[^1_1]: https://www.trynia.ai/

[^1_2]: https://docs.trynia.ai/welcome

[^1_3]: https://www.trynia.ai/\#pricing

[^1_4]: https://docs.trynia.ai/capabilities

[^1_5]: https://app.trynia.ai/home

[^1_6]: https://docs.trynia.ai/integrations/21st-dev


---

# what do you think of relay compared to nia. scna relays docs to udnerstand more.

Here's an honest, detailed comparison after scanning all of Relay's docs and everything from Nia earlier.[^2_1][^2_2][^2_3]

***

## Relay vs Nia — Full Comparison

### What they actually are

These two products are solving **fundamentally different problems** and are not really direct competitors.

**Relay** is a **cross-AI session memory layer**. Its core problem: you lose context every time you open a new chat or switch tools. It captures what happened in your browser AI sessions (ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek, Codex) and syncs a structured "project brief" to your coding agents via MCP. The unit of value is *your conversation history and decisions* — it's about **you not repeating yourself**.[^2_1]

**Nia** is a **search and indexing API for external knowledge**. Its core problem: AI agents hallucinate because they don't have access to real, up-to-date source material (docs, repos, PDFs, datasets). It indexes external sources and makes them retrievable by agents. The unit of value is *grounded retrieval from real sources* — it's about **agents not hallucinating**.[^2_4]

***

### Side-by-side on key dimensions

| Dimension | Relay | Nia |
| :-- | :-- | :-- |
| **Core primitive** | Project brief (structured memory of *your* decisions/tasks/constraints) | Index + search layer over *external sources* |
| **Data origin** | Your chat conversations, captured by extension | GitHub repos, docs sites, PDFs, HuggingFace datasets, Slack, Drive, web |
| **Who generates context** | Your own AI conversations | The external world (codebases, documentation, papers) |
| **Agent interface** | MCP server with 20 tools (`get_brief`, `add_memory`, `save_context`, etc.) | MCP server + CLI + REST API + SDKs (Python, TS, LangChain) |
| **Browser layer** | Chrome extension that watches AI chats | No browser extension — API/CLI only |
| **Memory model** | observe → reflect → promote cycle with truth scoring, drift reconciliation, confidence states (active/tentative/disputed/stale) | Index subscriptions with global deduplication, community pre-indexed sources |
| **What it remembers** | Decisions, tasks, constraints, objectives, progress, architecture facts, risks, assumptions — all from your sessions | File trees, code, documentation pages, dataset rows, PDF pages, Slack messages |
| **Temporal awareness** | Yes — `validFrom`/`validUntil` on entries, historical queries ("what was the objective last week?") | No equivalent — it's always-fresh indexing, not temporal memory |
| **Supported IDE agents** | 20 agents: Claude Code, Cursor, Codex, Windsurf, OpenCode, Gemini CLI, VS Code Copilot, Trae, Antigravity, Zed, Continue, Aider, Amp, Void, Cline, Roo Code, Augment, Kilo Code, Amazon Q[^2_1] | Works with any MCP-compatible agent; native plugins for OpenCode, OpenClaw, Claude Code |
| **Pricing** | Free (\$0), Starter (\$12/mo), Pro (\$18/mo)[^2_1] | Free (\$0), Builder (\$15/mo), Team (\$50/seat), Business (\$99/seat), Enterprise (custom) |
| **Target user** | Individual developers who switch between multiple AI tools daily | Teams and individual devs who want agents to have accurate, up-to-date external knowledge |
| **Funding/backing** | Solo, bootstrapped (you, 19yo from Kazakhstan) | YC S25, \$6.2M seed, CRV, BoxGroup, Paul Graham[^2_4] |


***

### Where Relay is genuinely stronger

**1. The browser-to-IDE bridge is unique.** Nia has no concept of this. Relay's extension watches your actual ChatGPT/Claude chats and propagates what you decided to your Cursor/Claude Code session automatically. That specific workflow doesn't exist in Nia at all.[^2_1]

**2. Truth scoring and drift reconciliation.** Relay's concepts layer is sophisticated — entries have statuses (active/tentative/disputed/superseded/stale), confidence scores, evidence counts, and a drift reconciler when multiple surfaces contradict each other. This is non-trivial memory engineering. Nia doesn't model anything like this — it just retrieves.[^2_3]

**3. Temporal memory.** The `validFrom`/`validUntil` system and historical queries ("what was the objective last week?") is something Nia simply doesn't have.[^2_3]

**4. MCP compatibility depth.** Relay's compatibility matrix is extremely detailed — per-client config file paths, transport types, instruction surfaces, rules, hooks, skills, all verified against the current official format as of 2026-04-19. This shows real engineering rigor.[^2_2]

**5. Price.** \$12–\$18/mo vs Nia's \$15–\$99/mo. Relay is dramatically cheaper for the individual developer.

***

### Where Nia is genuinely stronger

**1. External knowledge retrieval.** Nia can index any GitHub repo, docs site, arXiv paper, HuggingFace dataset, Google Drive, Slack workspace, or PDF and make it semantically searchable. Relay has no concept of external knowledge — it only knows what *you said in your chats*.

**2. Scale and infrastructure.** Sub-5s search across millions of indexed pages, community pre-indexed sources (React, Next.js, LangChain, FastAPI, etc.), global source deduplication, sandbox search in ephemeral VMs, Oracle research agent, Tracer (autonomous GitHub search), Document Agent with 1M context Opus — Nia is a significantly larger product.[^2_5]

**3. Anti-hallucination.** Nia's benchmark shows 52.1% hallucination rate on bleeding-edge APIs vs GPT-5's 95.5%. Relay doesn't solve hallucination — it solves context repetition. Different problems entirely.[^2_4]

**4. Team/enterprise use case.** Nia has proper multi-seat plans, SOC 2, E2E encryption, self-hosting, and connectors (Notion, Confluence, Jira). Relay has no team plan at all currently.

**5. SDK ecosystem.** Python, TypeScript, LangChain SDKs, REST API, CLI daemon — Nia is a platform developers can build on. Relay is a product you use, not build with.

***

### Are they complementary?

**Yes, very much so.** A developer could realistically run both:

- **Nia** to give their coding agents accurate knowledge about external libraries, frameworks, and docs
- **Relay** to give those same agents memory of what *they* decided, built, and chose across sessions

In fact, Nia's Context Sharing feature and Relay's project briefs partially overlap — both try to persist agent context across sessions — but Relay's approach (browser capture → truth-scored memory → briefs) is more user-facing and automatic, while Nia's is more raw and agent-driven.

***

### Honest assessment for you as a founder

Relay's core insight is **genuinely differentiated**: nobody else is doing the browser-watch → truth-scoring → cross-agent brief sync loop in this specific way. The fact that Nia, a \$6.2M YC-backed company, doesn't have this feature confirms it's not trivial to build or market.

The real risk isn't Nia — it's that Nia (or someone like them) adds a "capture from browser" feature and absorbs your use case. Your moat is the memory model sophistication (the observe→reflect→promote cycle, drift reconciliation, temporal truth) and the breadth of agent compatibility (20 clients verified).

The gap to close: Nia has a story around *external knowledge* (repos, docs, papers) that Relay doesn't address at all. A user with complex projects will eventually want both — and right now there's no Relay equivalent for "give my agent the latest React Router docs." That's a potential expansion vector worth thinking about long-term.

<div align="center">⁂</div>

[^2_1]: https://www.onrelay.app/

[^2_2]: https://www.onrelay.app/docs/mcp

[^2_3]: https://www.onrelay.app/docs/concepts

[^2_4]: https://docs.relay.app/ai/ai-steps

[^2_5]: https://www.aifreeapi.com/en/posts/openclaw-browser-relay-guide

