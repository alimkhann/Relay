import { Pool as NeonPool } from "@neondatabase/serverless"
import { Pool as PostgresPool } from "pg"

export type DatabaseMode = "neon" | "local"
export type DatabaseRow = Record<string, unknown>

export interface DatabaseProvider {
  mode: DatabaseMode
  query<T extends DatabaseRow = DatabaseRow>(text: string, values?: unknown[]): Promise<T[]>
}

export interface DatabaseConfig {
  connectionString: string
  mode: DatabaseMode
}

let neonPool: NeonPool | null = null
let postgresPool: PostgresPool | null = null

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
  if (!neonPool) {
    neonPool = new NeonPool({
      connectionString,
      max: 4
    })
  }

  return neonPool
}

function getPostgresPool(connectionString: string) {
  if (!postgresPool) {
    postgresPool = new PostgresPool({
      connectionString,
      max: 4
    })
  }

  return postgresPool
}

export function createRepositoryProvider(viewerUserId?: string): DatabaseProvider {
  const { connectionString, mode } = resolveDatabaseConfig()
  const database = mode === "local" ? getPostgresPool(connectionString) : getNeonPool(connectionString)

  return {
    mode,
    async query<T extends DatabaseRow = DatabaseRow>(text: string, values: unknown[] = []) {
      const client = await database.connect()

      try {
        if (viewerUserId) {
          await client.query("select set_config('relay.current_user_id', $1, true)", [viewerUserId])
        }

        const result = await client.query<T>(text, values)
        return result.rows
      } finally {
        client.release()
      }
    }
  }
}
