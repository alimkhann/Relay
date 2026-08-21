/**
 * Relay sync worker
 * -----------------
 * Offloads the single highest-CPU Vercel endpoint — `GET /api/extension/bindings`,
 * polled per-tab by the browser extension — onto Cloudflare's free tier, relieving
 * Vercel's 4 CPU-hr/month Hobby Active-CPU cap.
 *
 * This is a faithful, self-contained port of the Vercel handler's behaviour:
 *   - auth:    apps/web/src/server/policies/viewer.ts  (extension-token branch)
 *   - resolve: packages/db/src/repositories/binding-repository.ts  (resolve)
 *   - shape:   apps/web/src/server/services/binding-service.ts  (resolveBoundProject)
 *
 * The extension only reads `binding.binding.bindingKind` and
 * `binding.project.{id,name,slug}` (apps/extension/src/background/sync-controller.ts),
 * so the project summary is intentionally slim — no per-project fan-out.
 *
 * It owns both GET and POST for this single route. Other paths still proxy to
 * Vercel for direct workers.dev smoke tests, but production should only route
 * `/api/extension/bindings*` here.
 */
import { neon } from "@neondatabase/serverless"

export interface Env {
  /** Neon connection string (service/pooled role). Set via `wrangler secret put DATABASE_URL`. */
  DATABASE_URL: string
  /** A Vercel origin NOT behind the Cloudflare route, for proxying non-GET traffic. */
  VERCEL_ORIGIN: string
}

const BINDINGS_PATH = "/api/extension/bindings"
const BINDING_KINDS = new Set(["tab", "domain", "manual"])
const PLATFORMS = new Set(["chatgpt", "perplexity", "claude", "codex"])

interface ExtensionViewer {
  tokenId: string
  userId: string
}

interface BindingInput {
  projectId: string
  bindingKind: "tab" | "domain" | "manual"
  domain: string | null
  tabId: string | null
  platform: string | null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** SHA-256 hex — matches @relay/shared hashContent (createHash("sha256").digest("hex")). */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** Proxy a request unchanged to the Vercel origin (used for non-GET / other paths). */
function proxyToVercel(request: Request, env: Env, url: URL): Promise<Response> {
  const target = new URL(url.pathname + url.search, env.VERCEL_ORIGIN)
  return fetch(
    new Request(target.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    }),
  )
}

async function resolveExtensionViewer(request: Request, sql: any): Promise<ExtensionViewer | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!token || token.startsWith("relay_mcp_")) {
    return json({ error: "Unauthorized" }, 401)
  }

  const tokenHash = await sha256Hex(token)
  const tokenRows = (await sql`
    select id, user_id
    from extension_api_tokens
    where token_hash = ${tokenHash}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    limit 1
  `) as Array<{ id: string; user_id: string }>

  const tokenRow = tokenRows[0]
  if (!tokenRow) {
    return json({ error: "Unauthorized" }, 401)
  }

  return { tokenId: tokenRow.id, userId: tokenRow.user_id }
}

function parseNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function parseBindingInput(value: unknown): BindingInput | Response {
  if (!value || typeof value !== "object") {
    return json({ error: "Request validation failed." }, 400)
  }
  const record = value as Record<string, unknown>
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : ""
  const bindingKind = typeof record.bindingKind === "string" ? record.bindingKind : ""
  const platform = parseNullableString(record.platform)

  if (!projectId) {
    return json({ error: "projectId is required." }, 400)
  }
  if (!BINDING_KINDS.has(bindingKind)) {
    return json({ error: "Invalid bindingKind." }, 400)
  }
  if (platform !== null && !PLATFORMS.has(platform)) {
    return json({ error: "Invalid platform." }, 400)
  }

  return {
    projectId,
    bindingKind: bindingKind as BindingInput["bindingKind"],
    domain: parseNullableString(record.domain),
    tabId: parseNullableString(record.tabId),
    platform,
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Only own /api/extension/bindings. Everything else → Vercel origin.
    if (url.pathname !== BINDINGS_PATH) {
      return proxyToVercel(request, env, url)
    }
    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405)
    }

    // --- auth: extension token only (reject missing / MCP tokens) ---
    const sql = neon(env.DATABASE_URL)
    const viewer = await resolveExtensionViewer(request, sql)
    if (viewer instanceof Response) {
      return viewer
    }
    const userId = viewer.userId

    // Best-effort last_used_at touch (mirrors touchIfStale, 15m), non-blocking.
    ctx.waitUntil(
      sql`
        update extension_api_tokens
        set last_used_at = now()
        where id = ${viewer.tokenId}
          and (last_used_at is null or last_used_at < now() - make_interval(mins => 15))
      `.then(
        () => undefined,
        () => undefined,
      ),
    )

    if (request.method === "POST") {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return json({ error: "Invalid JSON body." }, 400)
      }

      const parsed = parseBindingInput(body)
      if (parsed instanceof Response) {
        return parsed
      }

      const membershipRows = (await sql`
        select 1
        from project_members
        where project_id = ${parsed.projectId}
          and user_id = ${userId}
        limit 1
      `) as Array<{ "?column?": number }>
      if (!membershipRows[0]) {
        return json({ error: "Project not found." }, 404)
      }

      const existingRows = (await sql`
        select *
        from project_bindings
        where user_id = ${userId}
          and binding_kind = cast(${parsed.bindingKind} as binding_type)
          and domain is not distinct from ${parsed.domain}
          and tab_id is not distinct from ${parsed.tabId}
        limit 1
      `) as Array<{ id: string }>

      const rows = existingRows[0]
        ? await sql`
            update project_bindings
            set project_id = ${parsed.projectId},
                platform = cast(${parsed.platform} as platform_type),
                updated_at = now()
            where id = ${existingRows[0].id}
            returning *
          `
        : await sql`
            insert into project_bindings (user_id, project_id, binding_kind, domain, tab_id, platform)
            values (
              ${userId},
              ${parsed.projectId},
              cast(${parsed.bindingKind} as binding_type),
              ${parsed.domain},
              ${parsed.tabId},
              cast(${parsed.platform} as platform_type)
            )
            returning *
          `

      ctx.waitUntil(
        sql`
          insert into capture_events (user_id, project_id, session_id, event_type, payload)
          values (${userId}, ${parsed.projectId}, null, 'project_bound', ${JSON.stringify(parsed)}::jsonb)
        `.then(
          () => undefined,
          () => undefined,
        ),
      )

      const binding = rows[0] as {
        id: string
        project_id: string
        binding_kind: string
        domain: string | null
        tab_id: string | null
        platform: string | null
        created_at: string
        updated_at: string
      }
      return json({
        binding: {
          id: binding.id,
          userId,
          projectId: binding.project_id,
          bindingKind: binding.binding_kind,
          domain: binding.domain,
          tabId: binding.tab_id,
          platform: binding.platform,
          createdAt: binding.created_at,
          updatedAt: binding.updated_at,
        },
      }, 201)
    }

    // --- resolve binding (port of BindingRepository.resolve; scoped by user_id) ---
    const domain = url.searchParams.get("domain")
    const tabId = url.searchParams.get("tabId")
    const platform = url.searchParams.get("platform")

    let bindingRow:
      | {
          id: string
          binding_kind: string
          domain: string | null
          tab_id: string | null
          platform: string | null
          project_id: string
          updated_at: string
        }
      | undefined
    try {
      const rows = (await sql`
        select *
        from project_bindings
        where user_id = ${userId}
          and (
            (binding_kind = 'tab' and tab_id is not distinct from ${tabId})
            or (binding_kind = 'domain' and domain is not distinct from ${domain})
            or (binding_kind = 'manual')
          )
        order by
          case
            when binding_kind = 'tab' and tab_id is not distinct from ${tabId} then 0
            when binding_kind = 'domain' and domain is not distinct from ${domain}
              and platform is not distinct from cast(${platform} as platform_type) then 1
            when binding_kind = 'domain' and domain is not distinct from ${domain} then 2
            when binding_kind = 'manual' then 3
            else 4
          end,
          updated_at desc
        limit 1
      `) as Array<typeof bindingRow & object>
      bindingRow = rows[0]
    } catch {
      // Invalid platform enum cast or transient error → behave like "no binding".
      return json({ binding: null })
    }

    if (!bindingRow) {
      return json({ binding: null })
    }

    // --- project (slim summary: id/name/slug — all the extension reads) ---
    const projectRows = (await sql`
      select id, name, slug
      from projects
      where id = ${bindingRow.project_id}
      limit 1
    `) as Array<{ id: string; name: string; slug: string | null }>

    const project = projectRows[0]
    if (!project) {
      return json({ binding: null })
    }

    return json({
      binding: {
        binding: {
          id: bindingRow.id,
          bindingKind: bindingRow.binding_kind,
          domain: bindingRow.domain,
          tabId: bindingRow.tab_id,
          platform: bindingRow.platform,
          updatedAt: bindingRow.updated_at,
        },
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
        },
      },
    })
  },
}
