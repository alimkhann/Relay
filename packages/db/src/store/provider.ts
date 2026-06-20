import { Pool as NeonPool } from "@neondatabase/serverless"
import { createRequire } from "node:module"
import type { Pool as PostgresPool } from "pg"

export type DatabaseMode = "neon" | "local"
export type DatabaseRow = Record<string, unknown>

export interface DatabaseProvider {
  mode: DatabaseMode
  query<T extends DatabaseRow = DatabaseRow>(text: string, values?: unknown[]): Promise<T[]>
  transaction<T>(callback: (provider: DatabaseProvider) => Promise<T>): Promise<T>
}

export interface DatabaseConfig {
  connectionString: string
  mode: DatabaseMode
}

const neonPools = new Map<string, NeonPool>()
const postgresPools = new Map<string, PostgresPool>()

function buildProviderFromClient(input: {
  mode: DatabaseMode
  client: { query<T extends DatabaseRow = DatabaseRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }> }
  viewerUserId?: string
  transactional?: boolean
}) : DatabaseProvider {
  let viewerContextApplied = false

  async function ensureViewerContext() {
    if (!input.viewerUserId || viewerContextApplied) {
      return
    }

    await input.client.query("select set_config('relay.current_user_id', $1, true)", [input.viewerUserId])
    viewerContextApplied = true
  }

  const provider: DatabaseProvider = {
    mode: input.mode,
    async query<T extends DatabaseRow = DatabaseRow>(text: string, values: unknown[] = []) {
      await ensureViewerContext()
      const result = await input.client.query<T>(text, values)
      return result.rows
    },
    async transaction<T>(callback: (provider: DatabaseProvider) => Promise<T>) {
      if (input.transactional) {
        return callback(provider)
      }

      await input.client.query("begin")
      try {
        await ensureViewerContext()
        const result = await callback(buildProviderFromClient({
          mode: input.mode,
          client: input.client,
          viewerUserId: input.viewerUserId,
          transactional: true,
        }))
        await input.client.query("commit")
        return result
      } catch (error) {
        await input.client.query("rollback")
        throw error
      }
    },
  }

  return provider
}

export function isLocalConnectionString(connectionString: string): boolean {
  try {
    const url = new URL(connectionString)
    const hostname = url.hostname.toLowerCase()
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local")
    )
  } catch {
    return false
  }
}

export function resolveDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env
): DatabaseConfig {
  const authProvider = env.AUTH_PROVIDER === "local" ? "local" : "neon"
  const primaryConnectionString = env.DATABASE_URL?.trim()
  const localConnectionString = env.LOCAL_DATABASE_URL?.trim()
  const localFallbackConnectionString =
    localConnectionString ||
    (primaryConnectionString && isLocalConnectionString(primaryConnectionString)
      ? primaryConnectionString
      : undefined)
  const connectionString =
    authProvider === "local"
      ? localFallbackConnectionString
      : primaryConnectionString || localConnectionString

  if (!connectionString) {
    if (authProvider === "local") {
      throw new Error(
        "LOCAL_DATABASE_URL is required when AUTH_PROVIDER=local unless DATABASE_URL already points to localhost."
      )
    }

    throw new Error("DATABASE_URL is required.")
  }

  if (authProvider === "local" || isLocalConnectionString(connectionString)) {
    return {
      connectionString,
      mode: "local",
    }
  }

  return {
    connectionString,
    mode: "neon",
  }
}

function getNeonPool(connectionString: string) {
  let pool = neonPools.get(connectionString)
  if (!pool) {
    pool = new NeonPool({ connectionString, max: 4 })
    neonPools.set(connectionString, pool)
  }
  return pool
}

// pg is loaded lazily, only in local mode, so the Neon/serverless path never
// imports it. The Cloudflare Workers runtime (OpenNext full offload) can't run
// pg's TCP stack; prod always uses the Neon HTTP driver, so require("pg") is
// never reached there and esbuild never bundles it into the worker.
let postgresPoolCtor: typeof PostgresPool | undefined
function getPostgresPool(connectionString: string) {
  let pool = postgresPools.get(connectionString)
  if (!pool) {
    if (!postgresPoolCtor) {
      postgresPoolCtor = createRequire(import.meta.url)("pg").Pool as typeof PostgresPool
    }
    pool = new postgresPoolCtor({ connectionString, max: 4 })
    postgresPools.set(connectionString, pool)
  }
  return pool
}

export function createRepositoryProvider(viewerUserId?: string, overrideConnectionString?: string): DatabaseProvider {
  let mode: DatabaseMode
  let connectionString: string
  if (overrideConnectionString) {
    connectionString = overrideConnectionString
    mode = isLocalConnectionString(connectionString) ? "local" : "neon"
  } else {
    const resolved = resolveDatabaseConfig()
    connectionString = resolved.connectionString
    mode = resolved.mode
  }
  const database = mode === "local" ? getPostgresPool(connectionString) : getNeonPool(connectionString)

  async function runTransaction<T>(callback: (provider: DatabaseProvider) => Promise<T>) {
    const client = await database.connect()

    try {
      await client.query("begin")
      const provider = buildProviderFromClient({
        mode,
        client,
        viewerUserId,
        transactional: true,
      })
      const result = await callback(provider)
      await client.query("commit")
      return result
    } catch (error) {
      await client.query("rollback")
      throw error
    } finally {
      client.release()
    }
  }

  return {
    mode,
    async query<T extends DatabaseRow = DatabaseRow>(text: string, values: unknown[] = []) {
      // RLS needs the viewer GUC and the data query in the SAME transaction:
      // `set_config(..., true)` is transaction-local, so running it as a
      // separate autocommit statement (the old bare path) loses it before the
      // query runs. The owner ignores RLS today, but a non-owner role
      // (relay_app) would then see zero rows. Wrap viewer reads in a txn.
      if (viewerUserId) {
        return runTransaction((provider) => provider.query<T>(text, values))
      }

      // No viewer (worker/service/admin roles): scope is not GUC-driven, so a
      // plain pooled query is correct and avoids needless transaction overhead.
      const client = await database.connect()
      try {
        const provider = buildProviderFromClient({ mode, client })
        return provider.query<T>(text, values)
      } finally {
        client.release()
      }
    },
    transaction: runTransaction,
  }
}

/**
 * Provider for the memory-pipeline worker (cron route). Uses a separate
 * connection string from WORKER_DATABASE_URL when set so the worker can run
 * under a dedicated role (e.g. relay_worker with bypassrls) once the app
 * itself moves to a least-privilege role. Falls back to the default
 * DATABASE_URL when WORKER_DATABASE_URL is unset — current behavior is
 * unchanged in that case.
 */
export function createWorkerRepositoryProvider(): DatabaseProvider {
  const workerUrl = process.env.WORKER_DATABASE_URL?.trim()
  return createRepositoryProvider(undefined, workerUrl || undefined)
}

/**
 * Provider for service/admin flows with no user viewer: pre-auth (login, OTP,
 * CLI/extension/wizard auth), webhooks (billing), and account deletion. These
 * legitimately read/write across users and tables that have no per-viewer RLS
 * scope, so they run under a dedicated `relay_service` role (bypassrls=true)
 * via SERVICE_DATABASE_URL once the app moves off the owner role. Falls back to
 * DATABASE_URL when SERVICE_DATABASE_URL is unset — behavior is unchanged in
 * that case, so wiring this in ahead of the cutover is a no-op at runtime.
 */
export function createServiceRepositoryProvider(): DatabaseProvider {
  const serviceUrl = process.env.SERVICE_DATABASE_URL?.trim()
  return createRepositoryProvider(undefined, serviceUrl || undefined)
}
