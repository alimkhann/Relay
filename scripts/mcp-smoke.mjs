import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);
const smokeProjectName = "Relay MCP Smoke";
const require = createRequire(import.meta.url);
const sdkPackageJson = require.resolve("@modelcontextprotocol/sdk/package.json", {
  paths: [join(repoRoot, "packages/mcp")],
});
const sdkRoot = dirname(dirname(dirname(sdkPackageJson)));
const { Client } = await import(`${sdkRoot}/dist/esm/client/index.js`);
const { StdioClientTransport } = await import(`${sdkRoot}/dist/esm/client/stdio.js`);
const { StreamableHTTPClientTransport } = await import(`${sdkRoot}/dist/esm/client/streamableHttp.js`);
const verbose = process.env.MCP_SMOKE_VERBOSE === "1";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readRelayConfig() {
  const raw = await readFile(join(process.env.HOME, ".relay", "mcp.json"), "utf8");
  const parsed = JSON.parse(raw);
  return {
    apiBase: (process.env.MCP_SMOKE_API_BASE ?? parsed.apiBase).replace(/\/+$/, ""),
    baseToken: parsed.token,
    accessToken: parsed.accessToken ?? parsed.token,
    refreshToken: parsed.refreshToken ?? null,
  };
}

async function resolveWorkingToken(apiBase, config) {
  const candidates = [
    { label: "access", token: config.accessToken },
    { label: "base", token: config.baseToken },
  ];

  for (const candidate of candidates) {
    if (!candidate.token) continue;
    const response = await fetch(`${apiBase}/api/viewer`, {
      headers: {
        Authorization: `Bearer ${candidate.token}`,
        Accept: "application/json",
      },
    });
    if (response.ok) {
      const viewer = await response.json();
      return { token: candidate.token, mode: viewer.mode ?? null };
    }
  }

  return {
    token: config.baseToken ?? config.accessToken,
    mode: null,
  };
}

async function apiFetchJson(apiBase, token, path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function ensureSmokeProject(apiBase, baseToken) {
  const list = await apiFetchJson(apiBase, baseToken, "/api/projects");
  const existing = (list.projects ?? []).find((project) => project.name === smokeProjectName || project.slug === "relay-mcp-smoke");
  if (existing) {
    return existing;
  }

  const created = await apiFetchJson(apiBase, baseToken, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: smokeProjectName,
      description: "Disposable project used to smoke-test Relay MCP tools end-to-end.",
    }),
  });
  return created.project;
}

async function seedCapture(apiBase, baseToken, projectId) {
  const timestamp = Date.now();
  return apiFetchJson(apiBase, baseToken, "/api/captures", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      platform: "chatgpt",
      session: {
        title: "Relay MCP Smoke Capture",
        url: `https://chatgpt.com/c/relay-mcp-smoke-${timestamp}`,
        pageFingerprint: `relay-mcp-smoke-${timestamp}`,
        sourceConversationId: `relay-mcp-smoke-${timestamp}`,
        metadata: { source: "mcp-smoke" },
      },
      turns: [
        { role: "user", content: "We should validate Relay MCP with a disposable project.", turnIndex: 0 },
        { role: "assistant", content: "Agreed. Capture this as smoke-test source context.", turnIndex: 1 },
      ],
    }),
  });
}

async function refreshMcpAccessToken(apiBase, config) {
  if (!config.refreshToken) {
    return config.accessToken;
  }

  try {
    const refreshed = await apiFetchJson(apiBase, config.baseToken, "/api/mcp/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: config.refreshToken }),
    });
    return refreshed.accessToken ?? config.accessToken;
  } catch {
    return config.accessToken;
  }
}

function extractText(result) {
  const textPart = (result.content ?? []).find((item) => item.type === "text");
  return textPart?.text ?? "";
}

function parseJsonText(result) {
  const text = extractText(result);
  return text ? JSON.parse(text) : null;
}

function extractIdFromMessage(result) {
  const text = extractText(result);
  const match = text.match(/\(id: ([^)]+)\)/);
  return match?.[1] ?? null;
}

async function connectStdioClient(accessToken, projectId) {
  const client = new Client({ name: "relay-smoke-stdio", version: "1.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: "node",
    args: [join(repoRoot, "packages/mcp/dist/index.js")],
    cwd: repoRoot,
    env: {
      ...process.env,
      RELAY_API_TOKEN: accessToken,
      RELAY_PROJECT_ID: projectId,
      CODEX_SHELL: "1",
    },
    stderr: "pipe",
  });

  await client.connect(transport);
  return { client, transport };
}

async function connectHttpClient(apiBase, accessToken) {
  const client = new Client({ name: "relay-smoke-http", version: "1.0.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${apiBase.replace(/\/+$/, "")}/api/mcp/stream`), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        token: accessToken,
      },
    },
  });

  await client.connect(transport);
  return { client, transport };
}

async function callTool(client, name, args = {}) {
  if (verbose) {
    console.log(`[smoke] calling ${name}`);
  }
  const result = await Promise.race([
    client.callTool({ name, arguments: args }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} timed out after 60s`)), 60_000)),
  ]);
  if (result.isError) {
    throw new Error(`${name} failed: ${extractText(result)}`);
  }
  if (verbose) {
    console.log(`[smoke] completed ${name}`);
  }
  return result;
}

async function runTransportSmoke(label, client, projectId, options = {}) {
  const summary = { label };
  const withProject = (args = {}) => (options.explicitProjectId ? { projectId, ...args } : args);

  const tools = await client.listTools();
  assert(tools.tools.length >= 20, `${label}: expected Relay MCP tools to be registered`);

  const listProjects = parseJsonText(await callTool(client, "list_projects", {}));
  assert(Array.isArray(listProjects) && listProjects.length > 0, `${label}: list_projects returned no projects`);

  try {
    await callTool(client, "set_current_project", { projectId });
    summary.setCurrentProject = "ok";
  } catch (error) {
    if (options.allowProjectSwitchFailure && error instanceof Error && error.message.includes("no MCP token id")) {
      summary.setCurrentProject = "unsupported_for_token";
    } else {
      throw error;
    }
  }

  let brief;
  try {
    brief = await callTool(client, "get_brief", withProject(options.getBriefArgs ?? {}));
  } catch (error) {
    if (!options.expectedProfileKey) {
      throw error;
    }
    const seeded = parseJsonText(await callTool(client, "regenerate_brief", withProject({
      kind: "fresh_chat_bootstrap",
      targetProfileKey: options.expectedProfileKey,
      ...(options.regenerateArgs ?? {}),
    })));
    assert(seeded?.packet?.id ?? seeded?.packetId, `${label}: failed to seed a fallback brief packet`);
    brief = await callTool(client, "get_brief", withProject({
      generate: false,
      kind: "fresh_chat_bootstrap",
      targetProfileKey: options.expectedProfileKey,
      ...(options.getBriefArgs ?? {}),
    }));
  }
  const briefStructured = brief.structuredContent ?? {};
  if (briefStructured.projectResolution?.projectId) {
    assert(briefStructured.projectResolution.projectId === projectId, `${label}: get_brief did not resolve the disposable project`);
  }
  assert(extractText(brief).length > 0, `${label}: get_brief returned no brief text`);

  const briefs = parseJsonText(await callTool(client, "list_briefs", withProject({})));
  assert(Array.isArray(briefs), `${label}: list_briefs did not return an array`);
  if (options.expectedProfileKey) {
    assert(briefs.some((packet) => packet.targetProfileKey === options.expectedProfileKey), `${label}: expected at least one ${options.expectedProfileKey} brief packet`);
  }

  const regenerated = parseJsonText(await callTool(client, "regenerate_brief", withProject({
    kind: "quick_continuity",
    ...(options.regenerateArgs ?? {}),
  })));
  const packetId = regenerated?.packet?.id ?? regenerated?.packetId ?? null;
  assert(packetId, `${label}: regenerate_brief did not return a packet id`);

  await callTool(client, "delete_brief", withProject({ packetId }));

  parseJsonText(await callTool(client, "get_project_state", withProject({})));

  const addMemoryResult = await callTool(client, "add_memory", withProject({
    type: "decision",
    title: "Relay MCP Smoke Decision",
    content: `${label} smoke decision recorded at ${new Date().toISOString()}`,
    tags: ["smoke", label],
  }));
  const memoryId = extractIdFromMessage(addMemoryResult);
  assert(memoryId, `${label}: could not parse memory id from add_memory`);

  const memoryItems = parseJsonText(await callTool(client, "list_memory", withProject({})));
  assert(Array.isArray(memoryItems) && memoryItems.some((item) => item.id === memoryId), `${label}: list_memory did not return the created item`);
  const createdMemory = memoryItems.find((item) => item.id === memoryId);
  assert(
    createdMemory && createdMemory.provenance && createdMemory.status,
    `${label}: list_memory fell back to the dashboard shape (missing provenance/status) — the primary explainability endpoint is failing`,
  );

  const memoryItem = parseJsonText(await callTool(client, "get_memory", withProject({ memoryId })));
  assert(memoryItem?.id === memoryId, `${label}: get_memory did not return the created item`);

  const searchResults = parseJsonText(await callTool(client, "search_context", withProject({ query: "smoke decision" })));
  assert(Array.isArray(searchResults), `${label}: search_context did not return an array`);

  await callTool(client, "recall_context", withProject({ query: "smoke decision" }));

  const sessions = parseJsonText(await callTool(client, "list_sessions", withProject({})));
  const sourceSessionId = sessions?.sourceSessions?.[0]?.id;
  assert(sourceSessionId, `${label}: list_sessions did not return a source session`);

  await callTool(client, "archive_session", withProject({ sessionId: sourceSessionId, archived: true }));
  await callTool(client, "archive_session", withProject({ sessionId: sourceSessionId, archived: false }));

  parseJsonText(await callTool(client, "trace_context_sources", withProject({ query: "smoke decision" })));
  const recentActivity = parseJsonText(await callTool(client, "list_recent_activity", withProject({ limit: 10 })));
  assert(Array.isArray(recentActivity), `${label}: list_recent_activity did not return an array`);

  await callTool(client, "checkpoint_context", withProject({
    summary: `${label} checkpoint summary`,
    decisions: [`${label} checkpoint decision`],
    nextSteps: [`${label} checkpoint next step`],
  }));

  await callTool(client, "save_context", withProject({
    summary: `${label} final smoke summary`,
    decisions: [`${label} finalized smoke decision`],
    progress: `${label} smoke progress`,
    nextSteps: [`${label} wrap up`],
  }));

  await callTool(client, "set_project_state", withProject({
    projectOverview: `${label} smoke project overview`,
    currentObjective: `${label} validate MCP smoke coverage`,
    recentProgress: `${label} exercised every MCP tool`,
    decisions: [`${label} project state decision`],
    constraints: [`${label} keep smoke changes isolated`],
    openTasks: [`${label} inspect smoke output`],
    relevantTools: ["relay-mcp"],
    replaceLists: false,
  }));

  await callTool(client, "update_project", withProject({
    description: `Disposable project for Relay MCP smoke verification (${label}).`,
  }));

  await callTool(client, "manage_memory", withProject({
    action: "update",
    memoryId,
    content: `${label} smoke decision updated`,
    tags: ["smoke", label, "updated"],
  }));

  await callTool(client, "manage_memory", withProject({
    action: "archive",
    memoryId,
  }));

  summary.memoryId = memoryId;
  summary.packetId = packetId;
  return summary;
}

async function main() {
  const config = await readRelayConfig();
  const refreshedAccessToken = await refreshMcpAccessToken(config.apiBase, config);
  const activeToken = await resolveWorkingToken(config.apiBase, {
    ...config,
    accessToken: refreshedAccessToken ?? config.accessToken,
  });
  const smokeProject = await ensureSmokeProject(config.apiBase, config.baseToken);
  await seedCapture(config.apiBase, config.baseToken, smokeProject.id);
  const transportMode = process.env.MCP_SMOKE_TRANSPORT ?? "both";

  const stdio = transportMode === "both" || transportMode === "stdio"
    ? await connectStdioClient(activeToken.token, smokeProject.id)
    : null;
  const http = transportMode === "both" || transportMode === "http"
    ? await connectHttpClient(config.apiBase, activeToken.token)
    : null;

  try {
    const stdioSummary = stdio
      ? await runTransportSmoke("stdio", stdio.client, smokeProject.id, {
          regenerateArgs: { syncSurface: "codex" },
          expectedProfileKey: "codex_implementation",
        })
      : null;
    const httpSummary = http
      ? await runTransportSmoke("http", http.client, smokeProject.id, {
          explicitProjectId: activeToken.mode !== "mcp",
          allowProjectSwitchFailure: activeToken.mode !== "mcp",
          getBriefArgs: { syncSurface: "codex" },
          regenerateArgs: { syncSurface: "codex" },
          expectedProfileKey: "codex_implementation",
        })
      : null;

    console.log(JSON.stringify({
      ok: true,
      projectId: smokeProject.id,
      stdio: stdioSummary,
      http: httpSummary,
    }, null, 2));
  } finally {
    await stdio?.transport.close().catch(() => {});
    await http?.transport.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
