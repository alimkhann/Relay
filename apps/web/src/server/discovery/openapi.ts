import { APP_API_ANCHOR, APP_ORIGIN } from "@/lib/site-config"

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Relay Public API",
      version: "1.0.0",
      description: "Slim public API description for Relay's REST, MCP authorization, and discovery surface.",
    },
    servers: [
      { url: APP_ORIGIN },
    ],
    paths: {
      "/api/health": {
        get: {
          summary: "Health check",
          responses: {
            "200": {
              description: "Service health response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      timestamp: { type: "string", format: "date-time" },
                    },
                    required: ["status", "timestamp"],
                  },
                },
              },
            },
          },
        },
      },
      "/api/mcp/token": {
        post: {
          summary: "Start MCP authorization",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    projectId: { type: "string", format: "uuid" },
                    codeChallenge: { type: "string" },
                    scopes: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["project:read", "project:write", "memory:read", "memory:write", "brief:read"],
                      },
                    },
                  },
                  required: ["projectId", "codeChallenge", "scopes"],
                },
              },
            },
          },
          responses: {
            "201": { description: "Authorization started" },
          },
        },
        patch: {
          summary: "Approve MCP authorization",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sessionCode: { type: "string" },
                  },
                  required: ["sessionCode"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Authorization approved" },
          },
        },
      },
      "/api/mcp/token/poll": {
        post: {
          summary: "Poll MCP authorization state",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    secret: { type: "string" },
                    codeVerifier: { type: "string" },
                  },
                  required: ["secret"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Authorization status response" },
          },
        },
      },
      "/api/mcp/refresh": {
        post: {
          summary: "Refresh an MCP access token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    refreshToken: { type: "string" },
                  },
                  required: ["refreshToken"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Token refresh response" },
          },
        },
      },
      "/api/mcp/revoke": {
        post: {
          summary: "Revoke an MCP access token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accessToken: { type: "string" },
                  },
                  required: ["accessToken"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Token revoked" },
          },
        },
      },
      "/api/projects": {
        get: { summary: "List projects", responses: { "200": { description: "Projects list" } } },
        post: { summary: "Create a project", responses: { "200": { description: "Project created" } } },
      },
      "/api/projects/{id}": {
        get: { summary: "Get project details", responses: { "200": { description: "Project details" } } },
        patch: { summary: "Update a project", responses: { "200": { description: "Project updated" } } },
        delete: { summary: "Archive a project", responses: { "200": { description: "Project archived" } } },
      },
      "/api/projects/{id}/memory": {
        get: { summary: "List project memory", responses: { "200": { description: "Memory list" } } },
        post: { summary: "Add project memory", responses: { "200": { description: "Memory item added" } } },
      },
      "/api/memory/{id}": {
        patch: { summary: "Update a memory item", responses: { "200": { description: "Memory item updated" } } },
        delete: { summary: "Delete a memory item", responses: { "200": { description: "Memory item deleted" } } },
      },
      "/api/projects/{id}/memory/batch": {
        post: { summary: "Batch write memory items", responses: { "200": { description: "Batch applied" } } },
      },
      "/api/projects/{id}/memory/search": {
        get: { summary: "Search project memory", responses: { "200": { description: "Search results" } } },
      },
      "/api/projects/{id}/context/compose": {
        post: { summary: "Compose a context brief", responses: { "200": { description: "Context brief" } } },
      },
      "/api/projects/{id}/context/history": {
        get: { summary: "List context packet history", responses: { "200": { description: "Packet history" } } },
      },
      "/api/projects/{id}/bootstrap": {
        post: { summary: "Generate a bootstrap brief", responses: { "200": { description: "Bootstrap generated" } } },
        patch: { summary: "Edit a cached bootstrap brief", responses: { "200": { description: "Bootstrap updated" } } },
        delete: { summary: "Delete cached bootstrap briefs or a specific brief", responses: { "200": { description: "Bootstrap cache deleted" } } },
      },
      "/api/projects/{id}/bootstrap/latest": {
        get: { summary: "Get the latest bootstrap brief", responses: { "200": { description: "Bootstrap payload" } } },
      },
      "/api/projects/{id}/handoff": {
        post: { summary: "Compose fresh-chat context", responses: { "200": { description: "Fresh-chat context composed" } } },
      },
      "/api/projects/{id}/work-sessions/open": {
        post: { summary: "Open a work session", responses: { "200": { description: "Session opened" } } },
      },
      "/api/projects/{id}/work-sessions/checkpoint": {
        post: { summary: "Checkpoint a work session", responses: { "200": { description: "Checkpoint saved" } } },
      },
      "/api/projects/{id}/work-sessions/close": {
        post: { summary: "Close a work session", responses: { "200": { description: "Session closed" } } },
      },
      "/api/extension/tokens": {
        post: { summary: "Create an extension or MCP token", responses: { "200": { description: "Token created" } } },
      },
      "/api/extension/tokens/{id}": {
        delete: { summary: "Revoke an extension or MCP token", responses: { "200": { description: "Token revoked" } } },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    "x-relay-api-anchor": APP_API_ANCHOR,
  }
}
