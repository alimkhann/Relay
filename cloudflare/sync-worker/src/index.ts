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
 * Anything that is NOT `GET /api/extension/bindings` (e.g. the rare POST that
 * creates a binding) is proxied straight back to Vercel, so behaviour for every
 * other method/path is unchanged.
 */
import { neon } from "@neondatabase/serverless"

export interface Env {
  /** Neon connection string (service/pooled role). Set via `wrangler secret put DATABASE_URL`. */
  DATABASE_URL: string
  /** A Vercel origin NOT behind the Cloudflare route, for proxying non-GET traffic. */
  VERCEL_ORIGIN: string
}

const BINDINGS_PATH = "/api/extension/bindings"

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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Only own GET /api/extension/bindings. Everything else → Vercel origin.
    if (request.method !== "GET" || url.pathname !== BINDINGS_PATH) {
      return proxyToVercel(request, env, url)
    }

    // --- auth: extension token only (reject missing / MCP tokens) ---
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    if (!token || token.startsWith("relay_mcp_")) {
      return json({ error: "Unauthorized" }, 401)
    }

    const sql = neon(env.DATABASE_URL)
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
    const userId = tokenRow.user_id

    // Best-effort last_used_at touch (mirrors touchIfStale, 15m), non-blocking.
    ctx.waitUntil(
      sql`
        update extension_api_tokens
        set last_used_at = now()
        where id = ${tokenRow.id}
          and (last_used_at is null or last_used_at < now() - make_interval(mins => 15))
      `.then(
        () => undefined,
        () => undefined,
      ),
    )

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
