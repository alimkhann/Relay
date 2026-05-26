import { Pool as NeonPool } from "@neondatabase/serverless"
import { Pool as PostgresPool } from "pg"

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

function getPostgresPool(connectionString: string) {
  let pool = postgresPools.get(connectionString)
  if (!pool) {
    pool = new PostgresPool({ connectionString, max: 4 })
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

  return {
    mode,
    async query<T extends DatabaseRow = DatabaseRow>(text: string, values: unknown[] = []) {
      const client = await database.connect()

      try {
        const provider = buildProviderFromClient({
          mode,
          client,
          viewerUserId,
        })
        return provider.query<T>(text, values)
      } finally {
        client.release()
      }
    },
    async transaction<T>(callback: (provider: DatabaseProvider) => Promise<T>) {
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
    },
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
