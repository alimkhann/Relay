import { describe, expect, it } from "vitest"

import { GET as markdownGet, HEAD as markdownHead } from "./agent-markdown/route"
import { GET as apiCatalogGet } from "./.well-known/api-catalog/route"
import { GET as agentSkillsIndexGet } from "./.well-known/agent-skills/index.json/route"
import { GET as mcpCardGet } from "./.well-known/mcp/server-card.json/route"
import { GET as openApiGet } from "./openapi.json/route"
import { GET as robotsGet } from "./robots.txt/route"
import { AGENT_SKILL_DOCUMENTS, getAgentSkillDigest } from "@/server/discovery/agent-skills"

describe("agent discovery routes", () => {
  it("serves an API catalog with absolute links", async () => {
    const response = await apiCatalogGet()
    const payload = await response.json()

    expect(response.headers.get("content-type")).toContain("application/linkset+json")
    expect(payload).toEqual({
      linkset: [
        {
          anchor: "https://www.onrelay.app/api/",
          "service-desc": [{ href: "https://www.onrelay.app/openapi.json", type: "application/openapi+json" }],
          "service-doc": [{ href: "https://www.onrelay.app/docs/api", type: "text/html" }],
          status: [{ href: "https://www.onrelay.app/api/health", type: "application/json" }],
        },
      ],
    })
  })

  it("serves an MCP server card with transport and capabilities", async () => {
    const response = await mcpCardGet()
    const payload = await response.json()

    expect(payload.serverInfo.name).toBe("relay")
    expect(payload.transport).toEqual({
      type: "streamable-http",
      endpoint: "https://www.onrelay.app/api/mcp/stream",
    })
    expect(payload.capabilities.tools.names).toContain("get_brief")
    expect(payload.capabilities.prompts.names).toContain("relay_session_guidelines")
    expect(payload.capabilities.resources.uris).toContain("relay://session-guidelines")
  })

  it("serves an agent skills index with matching digests", async () => {
    const response = await agentSkillsIndexGet()
    const payload = await response.json()

    expect(payload.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json")
    expect(payload.skills).toHaveLength(3)

    for (const skill of AGENT_SKILL_DOCUMENTS) {
      expect(payload.skills).toContainEqual({
        name: skill.slug,
        type: "skill-md",
        description: skill.description,
        url: `/.well-known/agent-skills/${skill.slug}/SKILL.md`,
        digest: getAgentSkillDigest(skill.content),
      })
    }
  })

  it("serves a slim OpenAPI document with the discovery surface", async () => {
    const response = await openApiGet()
    const payload = await response.json()

    expect(response.headers.get("content-type")).toContain("application/openapi+json")
    expect(payload.openapi).toBe("3.1.0")
    expect(payload.servers).toEqual([{ url: "https://www.onrelay.app" }])
    expect(payload.paths["/api/health"]).toBeDefined()
    expect(payload.paths["/api/mcp/token"]).toBeDefined()
    expect(payload.paths["/api/projects/{id}/memory"]).toBeDefined()
  })

  it("serves robots.txt with content signals", async () => {
    const response = await robotsGet()
    const body = await response.text()

    expect(response.headers.get("content-type")).toContain("text/plain")
    expect(body).toContain("Content-Signal: ai-train=no, search=yes, ai-input=yes")
    expect(body).toContain("User-Agent: GPTBot")
    expect(body).toContain("Sitemap: https://www.onrelay.app/sitemap.xml")
  })
})

describe("markdown negotiation route", () => {
  it("returns markdown with the expected headers", async () => {
    const response = await markdownGet(new Request("https://www.onrelay.app/agent-markdown?pathname=%2Fdocs%2Fapi"))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/markdown")
    expect(response.headers.get("vary")).toBe("Accept")
    expect(Number(response.headers.get("x-markdown-tokens"))).toBeGreaterThan(0)
    expect(body).toContain("# Relay API Reference")
    expect(body).toContain("`GET /api/projects`")
  })

  it("returns header-only markdown metadata on HEAD", async () => {
    const response = await markdownHead(new Request("https://www.onrelay.app/agent-markdown?pathname=%2F"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/markdown")
    expect(response.headers.get("vary")).toBe("Accept")
  })
})
